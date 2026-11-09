// Observe only this application's scroll events; no global monitor or input permission.
#import <AppKit/AppKit.h>
#include <node_api.h>

struct Scroll {
  double x, y, deltaX, deltaY;
  unsigned long phase, momentum;
};
struct Watch {
  napi_threadsafe_function callback;
  id monitor;
};
static void Deliver(napi_env env, napi_value callback, void *, void *data) {
  Scroll *scroll = static_cast<Scroll *>(data);
  if (env && callback) {
    napi_value object, value, result, receiver;
    napi_create_object(env, &object);
    const char *names[] = {"x", "y", "deltaX", "deltaY", "phase", "momentum"};
    double values[] = {scroll->x, scroll->y, scroll->deltaX, scroll->deltaY,
                       (double)scroll->phase, (double)scroll->momentum};
    for (int i = 0; i < 6; i++) {
      napi_create_double(env, values[i], &value);
      napi_set_named_property(env, object, names[i], value);
    }
    napi_get_undefined(env, &receiver);
    napi_call_function(env, receiver, callback, 1, &object, &result);
  }
  delete scroll;
}
static void Dispose(Watch *watch) {
  if (!watch->monitor) return;
  [NSEvent removeMonitor:watch->monitor];
  watch->monitor = nil;
  napi_release_threadsafe_function(watch->callback, napi_tsfn_abort);
}
static void Cleanup(napi_env, void *data, void *) {
  Watch *watch = static_cast<Watch *>(data);
  Dispose(watch);
  delete watch;
}
static napi_value Stop(napi_env env, napi_callback_info info) {
  void *data;
  napi_get_cb_info(env, info, nullptr, nullptr, nullptr, &data);
  Dispose(static_cast<Watch *>(data));
  napi_value result;
  napi_get_undefined(env, &result);
  return result;
}
static napi_value Start(napi_env env, napi_callback_info info) {
  size_t argc = 2, length = 0;
  napi_value args[2], resource, stop;
  void *bytes = nullptr;
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  if (argc != 2 || napi_get_buffer_info(env, args[0], &bytes, &length) != napi_ok || length != sizeof(void *)) {
    napi_throw_type_error(env, nullptr, "A native window handle and callback are required.");
    return nullptr;
  }
  NSView *view = (__bridge NSView *)(*(void **)bytes);
  __weak NSWindow *window = view.window;
  if (!window) {
    napi_throw_error(env, nullptr, "The native window is unavailable.");
    return nullptr;
  }
  Watch *watch = new Watch{};
  napi_create_string_utf8(env, "Kudium space scroll", NAPI_AUTO_LENGTH, &resource);
  if (napi_create_threadsafe_function(env, args[1], nullptr, resource, 0, 1, nullptr, nullptr, nullptr, Deliver, &watch->callback) != napi_ok) {
    delete watch;
    napi_throw_error(env, nullptr, "Could not observe scroll gestures.");
    return nullptr;
  }
  napi_unref_threadsafe_function(env, watch->callback);
  watch->monitor = [NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskScrollWheel handler:^NSEvent *(NSEvent *event) {
    if (event.window != window || !window || (event.modifierFlags & (NSEventModifierFlagControl | NSEventModifierFlagShift))) return event;
    NSView *content = window.contentView;
    NSPoint point = [content convertPoint:event.locationInWindow fromView:nil];
    Scroll *scroll = new Scroll{point.x, content.isFlipped ? point.y : content.bounds.size.height - point.y,
      -event.scrollingDeltaX, -event.scrollingDeltaY, (unsigned long)event.phase, (unsigned long)event.momentumPhase};
    if (napi_call_threadsafe_function(watch->callback, scroll, napi_tsfn_nonblocking) != napi_ok) delete scroll;
    return event;
  }];
  napi_create_function(env, "stop", NAPI_AUTO_LENGTH, Stop, watch, &stop);
  napi_add_finalizer(env, stop, watch, Cleanup, nullptr, nullptr);
  return stop;
}
static napi_value Init(napi_env env, napi_value exports) {
  napi_value start;
  napi_create_function(env, "start", NAPI_AUTO_LENGTH, Start, nullptr, &start);
  napi_set_named_property(env, exports, "start", start);
  return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
