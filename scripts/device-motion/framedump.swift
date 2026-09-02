import AVFoundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
// usage: framedump <video> <outdir> [maxFrames]
let args = CommandLine.arguments
guard args.count >= 3 else { print("usage: framedump <video> <outdir> [maxFrames]"); exit(2) }
let url = URL(fileURLWithPath: args[1]); let out = args[2]; let maxFrames = args.count > 3 ? Int(args[3])! : 100000
try? FileManager.default.createDirectory(atPath: out, withIntermediateDirectories: true)
let asset = AVURLAsset(url: url)
guard let track = asset.tracks(withMediaType: .video).first else { print("no video track"); exit(1) }
let reader = try! AVAssetReader(asset: asset)
let settings: [String: Any] = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
let output = AVAssetReaderTrackOutput(track: track, outputSettings: settings)
reader.add(output); reader.startReading()
var i = 0
var times: [Double] = []
while let sb = output.copyNextSampleBuffer(), i < maxFrames {
  let pts = CMSampleBufferGetPresentationTimeStamp(sb); times.append(CMTimeGetSeconds(pts))
  guard let pb = CMSampleBufferGetImageBuffer(sb) else { continue }
  CVPixelBufferLockBaseAddress(pb, .readOnly)
  let w = CVPixelBufferGetWidth(pb), h = CVPixelBufferGetHeight(pb), bpr = CVPixelBufferGetBytesPerRow(pb)
  let cs = CGColorSpaceCreateDeviceRGB()
  let ctx = CGContext(data: CVPixelBufferGetBaseAddress(pb), width: w, height: h, bitsPerComponent: 8, bytesPerRow: bpr, space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
  let img = ctx.makeImage()!
  CVPixelBufferUnlockBaseAddress(pb, .readOnly)
  let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: String(format: "%@/f%05d.png", out, i)) as CFURL, UTType.png.identifier as CFString, 1, nil)!
  CGImageDestinationAddImage(dest, img, nil); CGImageDestinationFinalize(dest)
  i += 1
}
let ts = times.map { String(format: "%.4f", $0) }.joined(separator: ",")
try! ts.write(toFile: out + "/times.csv", atomically: true, encoding: .utf8)
print("frames \(i) size \(track.naturalSize) fps \(track.nominalFrameRate)")
