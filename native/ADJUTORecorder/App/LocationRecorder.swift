import Foundation
import CoreLocation
import Combine
import UIKit

@MainActor final class LocationRecorder: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published private(set) var tracks: [Track] = []
    @Published private(set) var activeID: UUID?
    @Published private(set) var accuracy: Double?
    @Published private(set) var message = "記録開始後は、画面ロック・通話中も位置情報を取得します。"
    @Published private(set) var storageError: String?
    @Published private(set) var exportURL: URL?
    @Published private(set) var authorization: CLAuthorizationStatus = .notDetermined
    private let manager = CLLocationManager()
    private var store: TrackStore?
    private var waitingForPermission = false
    private var loaded = false
    var active: Track? { tracks.first { $0.id == activeID } }
    var canStart: Bool { loaded && active == nil && storageError == nil }

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = 5
        manager.activityType = .fitness
        manager.pausesLocationUpdatesAutomatically = false
        manager.showsBackgroundLocationIndicator = true
        manager.allowsBackgroundLocationUpdates = true
        do {
            let base = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            let store = try TrackStore(directory: base.appendingPathComponent("ADJUTOTracks", isDirectory: true))
            self.store = store; tracks = try store.load()
            // An interrupted process must never silently resume tracking on launch.
            for index in tracks.indices where tracks[index].status == .recording {
                tracks[index].pause(); try store.save(tracks[index])
            }
            activeID = tracks.first { $0.status != .finished }?.id
            loaded = true
            if activeID != nil { message = "前回の記録を復元しました。「再開」で新しい区間として続けられます。" }
        } catch { storageError = "保存記録を開けません。元ファイルは保持しています：" + error.localizedDescription }
    }

    func start(name: String, worker: String, site: String) {
        guard canStart, !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        let track = Track(name: name, worker: worker, site: site)
        do {
            guard let store else { return }; try store.save(track)
            tracks.insert(track, at: 0); activeID = track.id; resume()
        } catch { storageError = "記録を開始できません：" + error.localizedDescription }
    }
    func resume() {
        guard active?.status == .paused, UIApplication.shared.applicationState == .active else { return }
        switch manager.authorizationStatus {
        case .notDetermined:
            waitingForPermission = true; manager.requestWhenInUseAuthorization()
        case .authorizedAlways, .authorizedWhenInUse:
            guard manager.accuracyAuthorization == .fullAccuracy else {
                message = "設定で位置情報の「正確な位置情報」をオンにしてください。"; return
            }
            updateActive { $0.resume() }
            guard persistActive() else { updateActive { $0.pause() }; return }
            message = "GPS記録中。画面をロックしたり、電話へ切り替えたりできます。"
            manager.startUpdatingLocation()
        default: message = "iPhoneの設定からADJUTO Recorderの位置情報を許可してください。"
        }
    }
    func pause() {
        waitingForPermission = false; manager.stopUpdatingLocation()
        updateActive { $0.pause() }; _ = persistActive(); message = "一時停止中です。再開後は別区間になります。"
    }
    func finish() {
        guard active != nil else { return }
        waitingForPermission = false; manager.stopUpdatingLocation()
        updateActive { $0.finish() }
        if persistActive() { activeID = nil; message = "記録を保存しました。GPXを書き出して管理マップへ取り込めます。" }
    }
    func retrySave() {
        guard active != nil else { return }
        if persistActive(), active?.status == .finished { activeID = nil }
    }
    func prepareExport(_ track: Track) {
        exportURL = nil
        do {
            guard let store else { return }
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent("ADJUTOExports", isDirectory: true)
            exportURL = try store.export(track, to: directory)
        } catch { message = "書出しできません：" + error.localizedDescription }
    }
    private func updateActive(_ body: (inout Track) -> Void) {
        guard let i = tracks.firstIndex(where: { $0.id == activeID }) else { return }; body(&tracks[i])
    }
    @discardableResult private func persistActive() -> Bool {
        guard let track = active, let store else { return false }
        do { try store.save(track); storageError = nil; return true }
        catch { storageError = "保存できません。画面上の記録は保持しています。「保存を再試行」またはGPX書出しで保護してください：" + error.localizedDescription; return false }
    }
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        authorization = manager.authorizationStatus
        if authorization == .denied || authorization == .restricted {
            if active?.status == .recording { pause() }
            message = "位置情報が許可されていません。設定を確認してください。"
        } else if waitingForPermission && (authorization == .authorizedWhenInUse || authorization == .authorizedAlways) {
            waitingForPermission = false; resume()
        }
    }
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard active?.status == .recording else { return }
        var changed = false
        for fix in locations.sorted(by: { $0.timestamp < $1.timestamp }) {
            accuracy = fix.horizontalAccuracy.isFinite && fix.horizontalAccuracy >= 0 ? fix.horizontalAccuracy : nil
            let point = RecordedPoint(latitude: fix.coordinate.latitude, longitude: fix.coordinate.longitude, accuracy: fix.horizontalAccuracy, timestamp: fix.timestamp)
            let previousStatus = active?.status
            var rejection: String?
            updateActive { rejection = $0.accept(point) }
            if previousStatus != active?.status { changed = true }
            if let rejection { message = rejection }
            else { changed = true; message = "GPS記録中。ロック中・通話中も記録を継続します。" }
        }
        if changed && !persistActive() {
            manager.stopUpdatingLocation(); updateActive { $0.pause() }
        }
        if active?.status != .recording { manager.stopUpdatingLocation() }
    }
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        if let error = error as? CLError, error.code == .denied { pause() }
        message = "測位を確認してください：" + error.localizedDescription
    }
    // No scenePhase/background handler pauses GPS: calls and screen locks must keep recording.
}
