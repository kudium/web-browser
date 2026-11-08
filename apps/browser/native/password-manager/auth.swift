import Foundation
import LocalAuthentication

// No credentials enter or leave this process. Only success/failure is returned.
let context = LAContext()
context.localizedCancelTitle = "Cancel"
var error: NSError?
let available = context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error)
if CommandLine.arguments.contains("--check") {
    exit(available ? 0 : 2)
}
guard available else { exit(2) }
let reason = CommandLine.arguments.contains("--group")
    ? "Unlock a protected group in Kudium Browser"
    : "Access your saved passwords in Kudium Browser"
context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) { success, _ in
    exit(success ? 0 : 1)
}
RunLoop.main.run()
