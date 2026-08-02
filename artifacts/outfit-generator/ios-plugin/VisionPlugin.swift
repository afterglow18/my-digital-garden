import Foundation
import Capacitor
import Vision
import UIKit

@objc(VisionPlugin)
public class VisionPlugin: CAPPlugin {

    @objc func analyzeImage(_ call: CAPPluginCall) {
        guard let path = call.getString("path") else {
            call.resolve(["labels": [String](), "text": [String]()])
            return
        }

        DispatchQueue.global(qos: .userInitiated).async {
            guard let image = self.loadImage(from: path),
                  let cgImage = image.cgImage else {
                call.resolve(["labels": [String](), "text": [String]()])
                return
            }

            var labels   = [String]()
            var textOut  = [String]()
            let group    = DispatchGroup()

            // VNClassifyImageRequest — object/scene labels
            let classifyRequest = VNClassifyImageRequest()
            group.enter()
            DispatchQueue.global().async {
                let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
                do {
                    try handler.perform([classifyRequest])
                    if let results = classifyRequest.results {
                        labels = results
                            .filter { $0.confidence >= 0.3 }
                            .map { $0.identifier }
                    }
                } catch {}
                group.leave()
            }

            // VNRecognizeTextRequest — text in photo
            let textRequest = VNRecognizeTextRequest()
            textRequest.recognitionLevel = .accurate
            group.enter()
            DispatchQueue.global().async {
                let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
                do {
                    try handler.perform([textRequest])
                    if let results = textRequest.results {
                        textOut = results.compactMap { $0.topCandidates(1).first?.string }
                    }
                } catch {}
                group.leave()
            }

            group.wait()
            call.resolve(["labels": labels, "text": textOut])
        }
    }

    // MARK: — Helpers

    private func loadImage(from path: String) -> UIImage? {
        // data URL: "data:image/jpeg;base64,..."
        if path.hasPrefix("data:") {
            guard let comma = path.firstIndex(of: ",") else { return nil }
            let b64 = String(path[path.index(after: comma)...])
            guard let data = Data(base64Encoded: b64, options: .ignoreUnknownCharacters) else { return nil }
            return UIImage(data: data)
        }
        return UIImage(contentsOfFile: path)
    }
}
