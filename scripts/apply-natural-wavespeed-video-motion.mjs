import fs from "node:fs";
import path from "node:path";

const target = path.join(process.cwd(), "src", "lib", "wavespeed-video.ts");
let source = fs.readFileSync(target, "utf8");

const constantMarker =
  'export const VIDEO_INTERNAL_PROMPT = "Automatic companion video";';

const motionConstant = `const VIDEO_MOTION_PROMPT = [
  "Animate the same adult character from the reference image with smooth, natural, continuous motion.",
  "Preserve the exact recognizable face, identity, adult age, body proportions, skin tone, hair, anatomy, lighting, and scene continuity.",
  "Use believable breathing, blinking, eye movement, posture shifts, hair movement, and realistic fabric physics.",
  "If clothing shifts, opens, lowers, lifts, slides aside, or is removed during the clip, make that action progressive and physically believable: hands interact with the garment and fabric folds, stretches, and moves naturally over time.",
  "Never make clothing snap, rip away, teleport, dissolve, vanish instantly, or change abruptly between frames.",
  "Avoid sudden body morphing, identity drift, anatomy changes, jump cuts, or unrelated wardrobe changes.",
  "Keep the motion sensual and cinematic when appropriate to the source image, but always smooth and visually continuous."
].join(" ");`;

if (!source.includes("const VIDEO_MOTION_PROMPT = [")) {
  if (!source.includes(constantMarker)) {
    throw new Error("WAVESPEED_VIDEO_MOTION_CONSTANT_ANCHOR_MISSING");
  }
  source = source.replace(
    constantMarker,
    `${constantMarker}\n${motionConstant}`
  );
}

if (!source.includes("prompt: VIDEO_MOTION_PROMPT,")) {
  const bodyMarker = `  const body: Record<string, unknown> = {
    image: imageUrl,`;

  if (!source.includes(bodyMarker)) {
    throw new Error("WAVESPEED_VIDEO_MOTION_BODY_ANCHOR_MISSING");
  }

  source = source.replace(
    bodyMarker,
    `${bodyMarker}\n    prompt: VIDEO_MOTION_PROMPT,`
  );
}

for (const required of [
  '"bytedance/seedance-v1.5-pro/image-to-video-spicy"',
  "prompt: VIDEO_MOTION_PROMPT,",
  "Never make clothing snap, rip away, teleport, dissolve, vanish instantly",
  "generate_audio: false",
  "camera_fixed: false"
]) {
  if (!source.includes(required)) {
    throw new Error(`WAVESPEED_VIDEO_MOTION_VALIDATION_FAILED:${required}`);
  }
}

fs.writeFileSync(target, source, "utf8");
console.log("EVERBOND_WAVESPEED_VIDEO_MOTION natural-continuation=enabled abrupt-clothing-removal=blocked");
