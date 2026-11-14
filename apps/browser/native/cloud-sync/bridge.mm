// Main-process-only CloudKit bridge. Only encrypted record data crosses this boundary.
#import <Foundation/Foundation.h>
#import <CloudKit/CloudKit.h>
#include <node_api.h>
#include <string>

struct Work {
  napi_async_work handle;
  napi_deferred deferred;
  std::string input;
  std::string output;
  std::string error;
};
static id Wait(void (^start)(void (^)(id, NSError *)), NSError **error) {
  dispatch_semaphore_t ready = dispatch_semaphore_create(0);
  __block id result = nil;
  __block NSError *failure = nil;
  start(^(id value, NSError *problem) {
    result = value;
    failure = problem;
    dispatch_semaphore_signal(ready);
  });
  if (dispatch_semaphore_wait(ready, dispatch_time(DISPATCH_TIME_NOW, 25 * NSEC_PER_SEC))) {
    *error = [NSError errorWithDomain:@"KudiumCloud" code:1 userInfo:nil];
    return nil;
  }
  *error = failure;
  return result;
}
static NSDictionary *Record(CKRecord *record) {
  NSMutableDictionary *value = [NSMutableDictionary dictionaryWithDictionary:@{
    @"recordId": record.recordID.recordName,
    @"revision": record[@"revision"] ?: @0,
    @"deleted": record[@"deleted"] ?: @NO
  }];
  if (record[@"envelope"]) value[@"envelope"] = record[@"envelope"];
  return value;
}
static void Execute(napi_env env, void *data) {
  Work *work = static_cast<Work *>(data);
  @autoreleasepool {
    @try {
      NSError *error = nil;
      NSData *bytes = [NSData dataWithBytes:work->input.data() length:work->input.size()];
      id request = [NSJSONSerialization JSONObjectWithData:bytes options:0 error:&error];
      if (![request isKindOfClass:NSDictionary.class]) { work->error = "Invalid CloudKit request."; return; }
      NSString *operation = request[@"operation"];
      NSSet *fields = [NSSet setWithArray:@[@"operation", @"accountId", @"recordId", @"revision", @"envelope"]];
      for (id field in request) if (![fields containsObject:field]) { work->error = "Unknown CloudKit field."; return; }
      if (![@[@"account", @"get", @"put", @"list", @"remove"] containsObject:operation]) { work->error = "Unknown CloudKit operation."; return; }
      CKContainer *container = [CKContainer containerWithIdentifier:@"iCloud.com.kudium.kudiumbrowser"];
      CKRecordID *user = Wait(^(void (^done)(id, NSError *)) {
        [container fetchUserRecordIDWithCompletionHandler:^(CKRecordID *value, NSError *failure) { done(value, failure); }];
      }, &error);
      if (error || !user) { work->error = "iCloud account unavailable. Check app provisioning and iCloud sign-in."; return; }
      NSDictionary *result = nil;
      if ([operation isEqualToString:@"account"]) {
        result = @{ @"accountId": user.recordName };
      } else {
        if (![request[@"accountId"] isKindOfClass:NSString.class] || ![user.recordName isEqualToString:request[@"accountId"]]) {
          work->error = "iCloud account changed. Reconnect before syncing."; return;
        }
        CKDatabase *database = container.privateCloudDatabase;
        NSString *name = request[@"recordId"];
        if (![operation isEqualToString:@"list"]) {
          if (![name isKindOfClass:NSString.class] || name.length > 160 ||
              [name rangeOfString:@"^[A-Za-z0-9_-]{1,160}$" options:NSRegularExpressionSearch].location == NSNotFound) {
            work->error = "Invalid encrypted record ID."; return;
          }
        }
        if ([operation isEqualToString:@"list"]) {
          // Bounded full refresh; cursor-based zone changes are a later adapter layer.
          CKQuery *query = [[CKQuery alloc] initWithRecordType:@"KudiumEncryptedSnapshot" predicate:[NSPredicate predicateWithValue:YES]];
          NSMutableArray *records = [NSMutableArray array];
          CKQueryOperation *queryOperation = [[CKQueryOperation alloc] initWithQuery:query];
          queryOperation.resultsLimit = 1000;
          dispatch_semaphore_t done = dispatch_semaphore_create(0);
          __block NSError *failure = nil;
          __block BOOL truncated = NO;
          queryOperation.recordMatchedBlock = ^(CKRecordID *recordID, CKRecord *record, NSError *problem) { @synchronized(records) { if (problem) failure = problem; else [records addObject:Record(record)]; } };
          queryOperation.queryCompletionBlock = ^(CKQueryCursor *cursor, NSError *problem) { truncated = cursor != nil; if (problem) failure = problem; dispatch_semaphore_signal(done); };
          [database addOperation:queryOperation];
          if (dispatch_semaphore_wait(done, dispatch_time(DISPATCH_TIME_NOW, 25 * NSEC_PER_SEC))) { [queryOperation cancel]; work->error = "CloudKit refresh timed out."; return; }
          if (failure || truncated) { work->error = "CloudKit refresh failed or exceeded the record limit."; return; }
          result = @{ @"records": records };
        } else {
          CKRecordID *recordID = [[CKRecordID alloc] initWithRecordName:name];
          CKRecord *record = Wait(^(void (^done)(id, NSError *)) {
            [database fetchRecordWithID:recordID completionHandler:^(CKRecord *value, NSError *failure) { done(value, failure); }];
          }, &error);
          BOOL missing = error && error.code == CKErrorUnknownItem;
          if (record && ![record.recordType isEqualToString:@"KudiumEncryptedSnapshot"]) { work->error = "Unexpected CloudKit record type."; return; }
          if (error && !missing) { work->error = "CloudKit record lookup failed."; return; }
          if ([operation isEqualToString:@"get"]) {
            result = record ? Record(record) : @{ @"missing": @YES, @"revision": @0 };
          } else {
            NSNumber *expected = request[@"revision"];
            if (![expected isKindOfClass:NSNumber.class] || expected.doubleValue < 0 || expected.doubleValue >= 9007199254740991.0 || expected.doubleValue != expected.longLongValue) {
              work->error = "Invalid record revision."; return;
            }
            long long revision = record ? [record[@"revision"] longLongValue] : 0;
            if (revision != expected.longLongValue) { result = @{ @"conflict": @YES, @"revision": @(revision) }; }
            else {
              BOOL removing = [operation isEqualToString:@"remove"];
              NSString *envelope = request[@"envelope"];
              if (!removing && (![envelope isKindOfClass:NSString.class] || [envelope lengthOfBytesUsingEncoding:NSUTF8StringEncoding] > 1024 * 1024)) {
                work->error = "Invalid encrypted envelope."; return;
              }
              if (!record) record = [[CKRecord alloc] initWithRecordType:@"KudiumEncryptedSnapshot" recordID:recordID];
              record[@"revision"] = @(revision + 1);
              record[@"deleted"] = @(removing);
              record[@"envelope"] = removing ? nil : envelope;
              CKModifyRecordsOperation *save = [[CKModifyRecordsOperation alloc] initWithRecordsToSave:@[record] recordIDsToDelete:nil];
              save.savePolicy = CKRecordSaveIfServerRecordUnchanged;
              save.atomic = YES;
              dispatch_semaphore_t done = dispatch_semaphore_create(0);
              __block NSError *failure = nil;
              save.modifyRecordsCompletionBlock = ^(NSArray *saved, NSArray *deleted, NSError *problem) { failure = problem; dispatch_semaphore_signal(done); };
              [database addOperation:save];
              if (dispatch_semaphore_wait(done, dispatch_time(DISPATCH_TIME_NOW, 25 * NSEC_PER_SEC))) { [save cancel]; work->error = "CloudKit write timed out; refresh before retrying."; return; }
              if (failure) { work->error = "CloudKit conditional write failed; refresh before retrying."; return; }
              result = Record(record);
            }
          }
        }
      }
      NSData *encoded = [NSJSONSerialization dataWithJSONObject:result options:0 error:&error];
      if (!encoded || error) { work->error = "Invalid CloudKit response."; return; }
      work->output.assign(static_cast<const char *>(encoded.bytes), encoded.length);
    } @catch (NSException *exception) {
      work->error = "CloudKit is unavailable in this app configuration.";
    }
  }
}
static void Complete(napi_env env, napi_status status, void *data) {
  Work *work = static_cast<Work *>(data);
  napi_value value;
  if (status != napi_ok || !work->error.empty()) {
    napi_value message;
    const char *error = work->error.empty() ? "CloudKit operation cancelled." : work->error.c_str();
    napi_create_string_utf8(env, error, NAPI_AUTO_LENGTH, &message);
    napi_create_error(env, nullptr, message, &value);
    napi_reject_deferred(env, work->deferred, value);
  } else {
    napi_create_string_utf8(env, work->output.data(), work->output.size(), &value);
    napi_resolve_deferred(env, work->deferred, value);
  }
  napi_delete_async_work(env, work->handle);
  delete work;
}
static napi_value Request(napi_env env, napi_callback_info info) {
  size_t argc = 1, length = 0;
  napi_value args[1], promise, label;
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  if (argc != 1 || napi_get_value_string_utf8(env, args[0], nullptr, 0, &length) != napi_ok || length > 2 * 1024 * 1024) {
    napi_throw_type_error(env, nullptr, "Pass a bounded JSON CloudKit request."); return nullptr;
  }
  Work *work = new Work();
  work->input.resize(length + 1);
  napi_get_value_string_utf8(env, args[0], work->input.data(), length + 1, &length);
  work->input.resize(length);
  napi_create_promise(env, &work->deferred, &promise);
  napi_create_string_utf8(env, "KudiumCloudKit", NAPI_AUTO_LENGTH, &label);
  napi_create_async_work(env, nullptr, label, Execute, Complete, work, &work->handle);
  napi_queue_async_work(env, work->handle);
  return promise;
}
NAPI_MODULE_INIT() {
  napi_value request;
  napi_create_function(env, "request", NAPI_AUTO_LENGTH, Request, nullptr, &request);
  napi_set_named_property(env, exports, "request", request);
  return exports;
}
