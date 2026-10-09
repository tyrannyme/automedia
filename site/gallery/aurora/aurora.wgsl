struct Params {
  time: f32,
  width: f32,
  height: f32,
  pad: f32,
}

@group(0) @binding(0) var<uniform> params: Params;

fn hash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}

fn noise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2f(1.0, 0.0)), u.x),
    mix(hash(i + vec2f(0.0, 1.0)), hash(i + vec2f(1.0, 1.0)), u.x),
    u.y,
  );
}

fn fbm(p: vec2f) -> f32 {
  var value = 0.0;
  var amp = 0.5;
  var q = p;
  for (var i = 0; i < 5; i = i + 1) {
    value = value + noise(q) * amp;
    q = q * 2.02 + vec2f(13.7, 5.1);
    amp = amp * 0.5;
  }
  return value;
}

fn curtain(uv: vec2f, t: f32, offset: f32, scale: f32) -> f32 {
  let warp = fbm(vec2f(uv.x * 1.6 + offset, t * 0.18)) * 1.4;
  let band = uv.y - (0.42 + 0.16 * sin(uv.x * 2.4 * scale + warp * 2.5 + t * 0.35 + offset));
  let rays = 0.55 + 0.45 * noise(vec2f(uv.x * 46.0 * scale + warp * 9.0, t * 0.9 + offset));
  let lower = smoothstep(-0.02, 0.03, band);
  let fade = exp(-max(band, 0.0) * 5.5);
  return lower * fade * rays;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let t = params.time;
  let aspect = params.width / params.height;
  let p = vec2f(uv.x * aspect, 1.0 - uv.y);

  var color = mix(vec3f(0.008, 0.012, 0.03), vec3f(0.02, 0.05, 0.11), p.y);

  let cell = floor(uv * vec2f(params.width, params.height) / 3.0);
  let star = step(0.9965, hash(cell));
  let twinkle = 0.55 + 0.45 * sin(t * 3.0 + hash(cell + 7.0) * 40.0);
  color = color + vec3f(star * twinkle * smoothstep(0.35, 0.9, p.y));

  let green = curtain(p, t, 0.0, 1.0);
  let violet = curtain(p + vec2f(0.0, 0.08), t * 0.8, 3.7, 0.7);
  let teal = curtain(p - vec2f(0.0, 0.05), t * 1.1, 8.1, 1.3);
  color = color + vec3f(0.12, 1.0, 0.55) * green * 0.95;
  color = color + vec3f(0.55, 0.22, 1.0) * violet * 0.7;
  color = color + vec3f(0.1, 0.75, 1.0) * teal * 0.45;

  let ridge = 0.16 + fbm(vec2f(p.x * 2.2, 3.0)) * 0.2 + fbm(vec2f(p.x * 9.0, 8.0)) * 0.035;
  let land = smoothstep(ridge + 0.002, ridge - 0.002, p.y);
  let glow = exp(-max(p.y - ridge, 0.0) * 18.0) * 0.12;
  color = color + vec3f(0.1, 0.6, 0.4) * glow * (1.0 - land);
  color = mix(color, vec3f(0.005, 0.008, 0.014), land);

  let vignette = 1.0 - 0.45 * length((uv - 0.5) * vec2f(1.1, 1.3));
  color = color * vignette;
  color = color / (1.0 + color * 0.35);
  return vec4f(pow(color, vec3f(0.9)), 1.0);
}
