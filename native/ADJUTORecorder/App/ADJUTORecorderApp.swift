import SwiftUI

@main struct ADJUTORecorderApp: App {
    @StateObject private var recorder = LocationRecorder()
    var body: some Scene { WindowGroup { RecorderView().environmentObject(recorder) } }
}
