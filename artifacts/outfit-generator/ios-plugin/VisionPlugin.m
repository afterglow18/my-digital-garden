#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// Registers VisionPlugin with the Capacitor ObjC bridge.
// Capacitor auto-discovers plugins via the ObjC runtime — no AppDelegate change needed.
CAP_PLUGIN(VisionPlugin, "Vision",
    CAP_PLUGIN_METHOD(analyzeImage, CAPPluginReturnPromise);
)
