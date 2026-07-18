import Foundation
import CoreLocation

class LocationDelegate: NSObject, CLLocationManagerDelegate {
    let manager = CLLocationManager()
    var completion: ((Result<[String: Any], Error>) -> Void)?
    var timer: Timer?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyKilometer
    }

    func start() {
        DispatchQueue.main.async {
            self.manager.requestWhenInUseAuthorization()
            self.manager.startUpdatingLocation()
        }
        timer = Timer.scheduledTimer(withTimeInterval: 10, repeats: false) { _ in
            self.manager.stopUpdatingLocation()
            self.completion?(.failure(NSError(domain: "location", code: -1, userInfo: [NSLocalizedDescriptionKey: "Timed out"])))
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let loc = locations.last else { return }
        manager.stopUpdatingLocation()
        timer?.invalidate()
        let result: [String: Any] = [
            "latitude": loc.coordinate.latitude,
            "longitude": loc.coordinate.longitude,
            "horizontal_accuracy": loc.horizontalAccuracy,
            "timestamp": ISO8601DateFormatter().string(from: loc.timestamp),
        ]
        completion?(.success(result))
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        completion?(.failure(error))
    }
}

let delegate = LocationDelegate()
let semaphore = DispatchSemaphore(value: 0)
var output: String = ""

delegate.completion = { result in
    switch result {
    case .success(let data):
        if let json = try? JSONSerialization.data(withJSONObject: data, options: .prettyPrinted) {
            output = String(data: json, encoding: .utf8) ?? ""
        }
    case .failure(let error):
        output = "{\"error\": \"\(error.localizedDescription)\"}"
    }
    semaphore.signal()
}

delegate.start()
semaphore.wait()
print(output)
