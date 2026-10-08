const key = "triang.cameraCalibration.v1";

export function readCalibration() {
  try {
    const profile = JSON.parse(globalThis.localStorage.getItem(key));
    if (profile?.version !== 1 || ![profile.focal,profile.width,profile.height,...(profile.sides || [])].every(v => Number.isFinite(v) && v > 0) || profile.sides?.length !== 3) return null;
    return profile;
  } catch { return null; }
}

export function saveCalibration(profile) {
  globalThis.localStorage.setItem(key,JSON.stringify({...profile,version:1}));
}

export function calibrationMatches(profile,image) {
  return !!profile && profile.width === image.width && profile.height === image.height;
}
