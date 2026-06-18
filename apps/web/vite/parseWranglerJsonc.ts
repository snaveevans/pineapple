type WranglerConfig = {
  vars?: Record<string, string>;
};

function copyJsonString(raw: string, start: number): [segment: string, nextIndex: number] {
  let i = start + 1;
  while (i < raw.length) {
    if (raw[i] === "\\") {
      i += 2;
      continue;
    }
    if (raw[i] === '"') {
      return [raw.slice(start, i + 1), i + 1];
    }
    i++;
  }
  return [raw.slice(start), raw.length];
}

function stripJsoncComments(raw: string): string {
  let out = "";
  let i = 0;

  while (i < raw.length) {
    const ch = raw[i];
    if (ch === '"') {
      const [segment, next] = copyJsonString(raw, i);
      out += segment;
      i = next;
      continue;
    }
    if (ch === "/" && raw[i + 1] === "/") {
      i += 2;
      while (i < raw.length && raw[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && raw[i + 1] === "*") {
      i += 2;
      while (i < raw.length && !(raw[i] === "*" && raw[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    out += ch;
    i++;
  }

  return out;
}

function stripTrailingCommas(json: string): string {
  let out = "";
  let i = 0;

  while (i < json.length) {
    const ch = json[i];
    if (ch === '"') {
      const [segment, next] = copyJsonString(json, i);
      out += segment;
      i = next;
      continue;
    }
    if (ch === ",") {
      let j = i + 1;
      while (j < json.length && /\s/.test(json[j] ?? "")) j++;
      if (json[j] === "}" || json[j] === "]") {
        i++;
        continue;
      }
    }
    out += ch;
    i++;
  }

  return out;
}

export function parseWranglerJsonc(raw: string): WranglerConfig {
  return JSON.parse(stripTrailingCommas(stripJsoncComments(raw))) as WranglerConfig;
}
