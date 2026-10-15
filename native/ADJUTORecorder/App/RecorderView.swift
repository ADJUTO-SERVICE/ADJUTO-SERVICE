import SwiftUI
import MapKit

struct RecorderView: View {
    @EnvironmentObject private var recorder: LocationRecorder
    @State private var name = ""
    @State private var worker = ""
    @State private var site = ""
    @State private var confirmFinish = false
    @State private var camera: MapCameraPosition = .automatic
    private let teal = Color(red: 0.07, green: 0.44, blue: 0.43)

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text("配布した道を、そのまま記録。").font(.title2.bold())
                    Text("記録開始後は、ポケットに入れて配布・電話ができます。").font(.subheadline).foregroundStyle(.secondary)
                    if let active = recorder.active {
                        activeCard(active)
                    } else {
                        VStack(spacing: 12) {
                            TextField("記録名（例：樽町 午前配布）", text: $name).textFieldStyle(.roundedBorder)
                            TextField("作業者名", text: $worker).textFieldStyle(.roundedBorder)
                            TextField("現場名", text: $site).textFieldStyle(.roundedBorder)
                            Button("GPS記録を開始", systemImage: "location.fill") {
                                recorder.start(name: name, worker: worker, site: site)
                            }.buttonStyle(.borderedProminent).disabled(!recorder.canStart || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        }
                    }
                    if let error = recorder.storageError {
                        VStack(alignment: .leading, spacing: 10) {
                            Text(error).foregroundStyle(.red)
                            if recorder.active != nil { Button("保存を再試行") { recorder.retrySave() } }
                        }.accessibilityElement(children: .combine)
                    }
                    Text(recorder.message).font(.footnote).foregroundStyle(.secondary)
                    if let url = recorder.exportURL {
                        ShareLink(item: url) { Label("GPXを共有・ファイルに保存", systemImage: "square.and.arrow.up") }.buttonStyle(.borderedProminent)
                        Text("ファイルに保存 → ADJUTO MAPでルートを選択 →「iPhoneアプリの軌跡を読込」。").font(.footnote)
                    }
                    Divider()
                    Text("このiPhoneの記録").font(.headline)
                    if recorder.tracks.isEmpty { Text("記録はまだありません。").foregroundStyle(.secondary) }
                    ForEach(recorder.tracks) { track in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(track.name).font(.headline)
                            Text(track.startedAt, style: .date)
                            Text("\(track.worker) · \(track.site) · \(track.pointCount)点").font(.caption).foregroundStyle(.secondary)
                            Button("この記録をGPXで書出し", systemImage: "square.and.arrow.up") { recorder.prepareExport(track) }.disabled(track.status == .recording || track.pointCount == 0)
                        }.frame(maxWidth: .infinity, alignment: .leading).padding().background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14))
                    }
                    Link("ADJUTO MAPを開く", destination: URL(string: "https://adjuto-service.github.io/ADJUTO-SERVICE/")!)
                    Text("記録はこのiPhoneに保存され、会社サーバーへの自動送信・他の作業者との自動同期は行いません。地図表示にはAppleの地図サービスを使用します。アプリの強制終了や端末の電源断中は記録できません。").font(.caption).foregroundStyle(.secondary)
                }.padding(20)
            }.navigationTitle("ADJUTO Recorder").tint(teal)
            .confirmationDialog("今回の配布記録を終了しますか？", isPresented: $confirmFinish, titleVisibility: .visible) {
                Button("終了して保存") { recorder.finish() }
                Button("戻る", role: .cancel) {}
            }
        }
    }
    @ViewBuilder private func activeCard(_ track: Track) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Label(track.status == .recording ? "GPS記録中" : track.status == .finished ? "終了・保存を確認してください" : "一時停止中", systemImage: track.status == .recording ? "record.circle.fill" : "pause.circle.fill").font(.title3.bold())
            Text(track.name).font(.headline)
            HStack { Text("\(track.pointCount)点"); Spacer(); Text(recorder.accuracy.map { "精度 ±\(Int(max(0, $0)))m" } ?? "測位待ち") }.font(.subheadline)
            Map(position: $camera) {
                ForEach(track.parts.filter { $0.points.count >= 2 }) { part in
                    MapPolyline(coordinates: part.points.map { CLLocationCoordinate2D(latitude: $0.latitude, longitude: $0.longitude) }).stroke(teal, lineWidth: 5)
                }
                if let point = track.lastPoint {
                    Annotation("最終記録", coordinate: CLLocationCoordinate2D(latitude: point.latitude, longitude: point.longitude)) { Circle().fill(teal).frame(width: 14, height: 14).overlay(Circle().stroke(.white, lineWidth: 3)) }
                }
            }.frame(height: 240).clipShape(RoundedRectangle(cornerRadius: 14))
            HStack {
                if track.status == .recording { Button("一時停止") { recorder.pause() } }
                if track.status == .paused { Button("記録を再開") { recorder.resume() } }
                if track.status != .finished { Button("終了") { confirmFinish = true } }
            }.buttonStyle(.borderedProminent)
            if track.status != .recording && track.pointCount > 0 { Button("この記録をGPXで書出し") { recorder.prepareExport(track) } }
        }.padding().background(teal.opacity(0.08), in: RoundedRectangle(cornerRadius: 18))
    }
}
