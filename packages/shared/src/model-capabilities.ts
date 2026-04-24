export type VideoModelCapabilityLike = {
  supportedFrameImages?: string[];
  allowedPassthroughParameters?: string[];
};

export function supportsImageGuidedVideo(capability: VideoModelCapabilityLike | null | undefined) {
  return Boolean(
    capability &&
      ((capability.supportedFrameImages?.length ?? 0) > 0 ||
        capability.allowedPassthroughParameters?.includes("input_references"))
  );
}
