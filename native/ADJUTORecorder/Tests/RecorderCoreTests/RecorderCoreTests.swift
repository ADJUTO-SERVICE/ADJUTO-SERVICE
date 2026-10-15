import XCTest
@testable import RecorderCore

final class RecorderCoreTests: XCTestCase {
    let now = Date(timeIntervalSince1970: 1_792_000_000)
    func point(_ lat: Double = 35, seconds: Double = 0, accuracy: Double = 10) -> RecordedPoint {
        RecordedPoint(latitude: lat, longitude: 139, accuracy: accuracy, timestamp: now.addingTimeInterval(seconds))
    }
    func testFilteringAndPauseBoundaries() {
        var t = Track(name: "配布", worker: "担当", site: "現場", now: now)
        XCTAssertNotNil(t.accept(point(), now: now))
        t.resume()
        XCTAssertNil(t.accept(point(), now: now))
        XCTAssertNotNil(t.accept(point(35, seconds: 1), now: now.addingTimeInterval(1)))
        XCTAssertNotNil(t.accept(point(36, seconds: 2), now: now.addingTimeInterval(2)))
        XCTAssertNotNil(t.accept(point(35.0001, seconds: 5, accuracy: 60), now: now.addingTimeInterval(5)))
        XCTAssertNil(t.accept(point(35.0001, seconds: 5), now: now.addingTimeInterval(5)))
        t.pause(); t.resume()
        XCTAssertNil(t.accept(point(36, seconds: 10), now: now.addingTimeInterval(10)))
        XCTAssertEqual(t.parts.count, 2)
        t.finish(now: now.addingTimeInterval(15)); t.resume()
        XCTAssertEqual(t.status, .finished)
    }
    func testLongGapAndStaleFix() {
        var t = Track(name: "配布", worker: "", site: "", now: now); t.resume()
        XCTAssertNil(t.accept(point(), now: now))
        XCTAssertNotNil(t.accept(point(seconds: -31), now: now))
        XCTAssertNil(t.accept(point(35.0002, seconds: 70), now: now.addingTimeInterval(70)))
        XCTAssertEqual(t.parts.count, 2)
    }
    func testAtomicPersistenceAndCorruptionProtection() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = try TrackStore(directory: directory)
        var t = Track(name: "配布 & <現場>", worker: "担当", site: "現場", now: now); t.resume()
        _ = t.accept(point(), now: now); try store.save(t)
        XCTAssertEqual(try store.load().first?.pointCount, 1)
        XCTAssertEqual(try store.load().first?.worker, "担当")
        let gpx = t.gpx(); XCTAssertTrue(gpx.contains("&amp; &lt;現場&gt;")); XCTAssertTrue(gpx.contains("<trkpt lat=")); XCTAssertTrue(gpx.contains(t.id.uuidString.lowercased()))
        let broken = directory.appendingPathComponent("broken.json")
        try Data("invalid".utf8).write(to: broken)
        XCTAssertThrowsError(try store.load())
        XCTAssertTrue(FileManager.default.fileExists(atPath: broken.path))
    }
}
