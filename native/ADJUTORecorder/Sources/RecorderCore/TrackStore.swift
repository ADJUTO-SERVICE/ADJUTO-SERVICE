import Foundation

// One atomic file per session. No deletion or replacement of another session.
public final class TrackStore {
    public let directory: URL
    public init(directory: URL) throws {
        self.directory = directory
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        #if os(iOS)
        try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: directory.path)
        #endif
    }
    public func save(_ track: Track) throws {
        let encoder = JSONEncoder(); encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(track)
        let url = directory.appendingPathComponent(track.id.uuidString).appendingPathExtension("json")
        #if os(iOS)
        try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        #else
        try data.write(to: url, options: .atomic)
        #endif
    }
    public func load() throws -> [Track] {
        let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
        let urls = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
        // Fail visibly if a record is unreadable. Never replace it with an empty collection.
        return try urls.filter { $0.pathExtension == "json" }.map { try decoder.decode(Track.self, from: Data(contentsOf: $0)) }.sorted { $0.startedAt > $1.startedAt }
    }
    public func export(_ track: Track, to directory: URL) throws -> URL {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let url = directory.appendingPathComponent("ADJUTO-" + track.id.uuidString).appendingPathExtension("gpx")
        try Data(track.gpx().utf8).write(to: url, options: .atomic)
        return url
    }
}
