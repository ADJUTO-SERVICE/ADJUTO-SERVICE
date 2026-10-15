import Foundation

public struct RecordedPoint: Codable, Equatable {
    public var latitude: Double
    public var longitude: Double
    public var accuracy: Double
    public var timestamp: Date
    public init(latitude: Double, longitude: Double, accuracy: Double, timestamp: Date) {
        self.latitude = latitude; self.longitude = longitude
        self.accuracy = accuracy; self.timestamp = timestamp
    }
}

public struct TrackPart: Codable, Identifiable {
    public var id: UUID = UUID()
    public var points: [RecordedPoint] = []
    public init() {}
}

public struct Track: Codable, Identifiable {
    public enum Status: String, Codable { case recording, paused, finished }
    public var version = 1
    public var id: UUID = UUID()
    public var name: String
    public var worker: String
    public var site: String
    public var startedAt: Date
    public var endedAt: Date?
    public var status: Status = .paused
    public var parts: [TrackPart] = []
    public var pointCount: Int { parts.reduce(0) { $0 + $1.points.count } }
    public var lastPoint: RecordedPoint? { parts.reversed().compactMap { $0.points.last }.first }

    public init(name: String, worker: String, site: String, now: Date = Date()) {
        self.name = String(name.prefix(100)); self.worker = String(worker.prefix(100))
        self.site = String(site.prefix(100)); self.startedAt = now
    }

    public mutating func resume() {
        guard status == .paused else { return }
        status = .recording
        parts.append(TrackPart())
    }
    public mutating func pause() { if status == .recording { status = .paused } }
    public mutating func finish(now: Date = Date()) { status = .finished; endedAt = now }

    // Returns a user-facing reason when a fix is excluded. Pauses and long gaps stay separate.
    @discardableResult public mutating func accept(_ point: RecordedPoint, now: Date = Date()) -> String? {
        guard status == .recording else { return "記録は停止中です" }
        guard pointCount < 50_000, parts.count < 1_000 else { pause(); return "記録上限です。終了して次の記録を開始してください" }
        let last = parts.last?.points.last
        if let reason = GPSFilter.rejection(point, after: last, now: now) { return reason }
        if parts.isEmpty || (last.map { point.timestamp.timeIntervalSince($0.timestamp) > 60 } ?? false) {
            parts.append(TrackPart())
        } else if parts[parts.count - 1].points.count >= 5_000 {
            var next = TrackPart()
            if let last { next.points.append(last) }
            parts.append(next)
        }
        parts[parts.count - 1].points.append(point)
        return nil
    }

    public func gpx() -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let segments = parts.filter { !$0.points.isEmpty }.map { part in
            "<trkseg>" + part.points.map { p in
                "<trkpt lat=\"\(p.latitude)\" lon=\"\(p.longitude)\"><time>\(formatter.string(from: p.timestamp))</time><extensions><adjuto:accuracy>\(p.accuracy)</adjuto:accuracy></extensions></trkpt>"
            }.joined() + "</trkseg>"
        }.joined()
        return """
        <?xml version="1.0" encoding="UTF-8"?>
        <gpx version="1.1" creator="ADJUTO Recorder" xmlns="http://www.topografix.com/GPX/1/1" xmlns:adjuto="https://adjuto-service.github.io/ADJUTO-SERVICE/ns/1">
        <metadata><name>\(Self.xml(name))</name></metadata>
        <trk><name>\(Self.xml(name))</name><extensions><adjuto:trackId>\(id.uuidString.lowercased())</adjuto:trackId><adjuto:worker>\(Self.xml(worker))</adjuto:worker><adjuto:site>\(Self.xml(site))</adjuto:site></extensions>\(segments)</trk></gpx>
        """
    }
    private static func xml(_ value: String) -> String {
        value.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;").replacingOccurrences(of: ">", with: "&gt;").replacingOccurrences(of: "\"", with: "&quot;").replacingOccurrences(of: "'", with: "&apos;")
    }
}

public enum GPSFilter {
    public static func distance(_ a: RecordedPoint, _ b: RecordedPoint) -> Double {
        let r = Double.pi / 180, lat = (b.latitude - a.latitude) * r, lon = (b.longitude - a.longitude) * r
        let h = pow(sin(lat / 2), 2) + cos(a.latitude * r) * cos(b.latitude * r) * pow(sin(lon / 2), 2)
        return 6_371_000 * 2 * asin(min(1, sqrt(h)))
    }
    public static func rejection(_ point: RecordedPoint, after last: RecordedPoint?, now: Date) -> String? {
        guard point.latitude.isFinite, point.longitude.isFinite, point.accuracy.isFinite,
              abs(point.latitude) <= 85, abs(point.longitude) <= 180, point.accuracy >= 0 else { return "不正な測位を除外しました" }
        let age = now.timeIntervalSince(point.timestamp)
        guard age.isFinite, age <= 30, age >= -5 else { return "古い測位を除外しました" }
        guard point.accuracy <= 50 else { return "精度50m超の測位を除外しました" }
        if let last {
            let seconds = point.timestamp.timeIntervalSince(last.timestamp)
            guard seconds > 0 else { return "重複・逆順の測位を除外しました" }
            let meters = distance(last, point)
            guard meters / seconds <= 15 else { return "急な位置の飛びを除外しました" }
            guard meters >= max(5, min(point.accuracy, last.accuracy) * 0.5) else { return "静止中の揺れを除外しました" }
        }
        return nil
    }
}
