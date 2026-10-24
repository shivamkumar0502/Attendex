export function mediaError(error) {
  if (["NotAllowedError", "SecurityError"].includes(error?.name))
    return "Permission denied. Allow camera/microphone access in your browser site settings, then try again.";
  if (error?.name === "NotFoundError")
    return "No compatible camera or microphone was found. Connect a device or continue without it.";
  if (error?.name === "NotReadableError")
    return "This device is busy. Close other camera/microphone apps and try again.";
  return (
    error?.message ||
    "Unable to access this device. Try another browser or use manual attendance."
  );
}
