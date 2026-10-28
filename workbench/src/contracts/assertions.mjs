export const assert = (value, message) => {
  if (!value) throw new Error(message);
};

export const safeId = value => typeof value === "string" && /^[a-z][a-z0-9-]{0,63}$/.test(value);
