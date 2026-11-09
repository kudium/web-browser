// Test-only AppKit event source. Built into a temporary addon by the smoke test.
#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
#include <node_api.h>
@interface TestScroll : NSEvent
@property NSEvent *base;
@property NSWindow *target;
@property NSEventPhase testPhase;
@property NSEventPhase testMomentum;
@property NSPoint point;
@property double dx;
@property double dy;
@end
@implementation TestScroll
- (id)forwardingTargetForSelector:(SEL)selector { return self.base; }
- (NSEventType)type { return NSEventTypeScrollWheel; }
- (NSWindow *)window { return self.target; }
- (NSInteger)windowNumber { return self.target.windowNumber; }
- (NSEventPhase)phase { return self.testPhase; }
- (NSEventPhase)momentumPhase { return self.testMomentum; }
- (NSPoint)locationInWindow { return self.point; }
- (double)scrollingDeltaX { return self.dx; }
- (double)scrollingDeltaY { return self.dy; }
- (CGFloat)deltaX { return self.dx; }
- (CGFloat)deltaY { return self.dy; }
- (BOOL)hasPreciseScrollingDeltas { return YES; }
- (NSEventModifierFlags)modifierFlags { return 0; }
- (NSTimeInterval)timestamp { return NSProcessInfo.processInfo.systemUptime; }
- (CGEventRef)CGEvent { return self.base.CGEvent; }
@end
static napi_value Post(napi_env env, napi_callback_info info) {
  napi_value args[7]; size_t count=7, size; void *handle;
  napi_get_cb_info(env,info,&count,args,nullptr,nullptr);
  napi_get_buffer_info(env,args[0],&handle,&size);
  NSView *view=(__bridge NSView *)(*(void **)handle);
  double values[6];
  for(int i=0;i<6;i++) napi_get_value_double(env,args[i+1],&values[i]);
  CGEventRef cg=CGEventCreateScrollWheelEvent(nullptr,kCGScrollEventUnitPixel,2,(int)-values[3],(int)-values[2]);
  TestScroll *event=[[TestScroll alloc] init];
  event.base=[NSEvent eventWithCGEvent:cg];
  CFRelease(cg);
  event.target=view.window;
  event.testPhase=(NSEventPhase)(unsigned long)values[0];
  event.testMomentum=(NSEventPhase)(unsigned long)values[1];
  event.dx=-values[2]; event.dy=-values[3];
  event.point=NSMakePoint(values[4],view.window.contentView.bounds.size.height-values[5]);
  [NSApp sendEvent:event];
  napi_value result; napi_get_undefined(env,&result); return result;
}
static napi_value Init(napi_env env,napi_value exports) {
  napi_value post; napi_create_function(env,"post",NAPI_AUTO_LENGTH,Post,nullptr,&post);
  napi_set_named_property(env,exports,"post",post); return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
