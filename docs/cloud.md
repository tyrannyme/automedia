# Headless cloud rendering

Automedia's engine does not need Electron, a display server, or a physical GPU.
A cloud host still needs Node.js, native codec dependencies, a compatible
Chromium headless shell, and permission to launch browser processes and use
loopback sockets. An executable override cannot remove host sandbox restrictions.

## Pre-provisioned browser

Set `AUTOMEDIA_CHROMIUM_EXECUTABLE_PATH` to the **absolute executable file** before
starting the engine:

```sh
export AUTOMEDIA_CHROMIUM_EXECUTABLE_PATH=/opt/chromium/headless_shell
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
node bin/automedia.cjs daemon --library /data/automedia
```

Use the actual path in your image; the example is not an installation command.
For an MCP client, put these variables in its server environment. Restart any
already-running engine for the library: it retains the environment it started
with. This affects validation, thumbnails, stills, offline audio and the video
frame farm. It does not choose Electron's studio browser.

The file must exist and be executable (on Windows, a regular accessible file).
Paths containing spaces are passed directly to Playwright, not through a shell.
An invalid path or failed explicit launch produces an error; Automedia never
silently downloads or switches to another browser when an override is set.
Unset or empty means the existing Playwright browser selection and first-render
installation behavior. `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` continues to prevent
that automatic installation.

Prefer the **Chromium headless shell matching the project's pinned Playwright
version**. A system browser with a different version is not guaranteed compatible.
In particular, video exports need the `HeadlessExperimental` begin-frame CDP
commands; ordinary full Chrome/Chromium is not a general replacement. A browser
that can render a PNG has not thereby passed video or audio export testing.
No sandbox switches, launch flags, or process permissions are changed by the
override.

## CPU-only smoke image

`tools/cloud/Dockerfile` starts from an official pinned Node.js Debian image and
installs Chromium headless shell and its OS dependencies using the exact locked
Playwright version during the image build, not on first render. Build requires
network access to the base image, package registry, OS repositories and browser
download host. Dependencies install like the CI test job: from the frozen
lockfile, with install scripts disabled.

```sh
docker build -f tools/cloud/Dockerfile -t automedia-cloud-test .
docker run --rm --init --cpus=2 --memory=4g --shm-size=512m automedia-cloud-test
```

This is a test image, not a production daemon or an untrusted-content isolation
boundary. It runs as `node`, requests no GPU or privileged capabilities, and
retains Automedia/Playwright's existing browser launch defaults. Run only its
owned fixture; do not mount secrets or arbitrary compositions into it. The image
contains development dependencies to run tests, not just the production CLI.

The entrypoint selects the image's headless shell explicitly and disables
first-render downloads. The opt-in smoke test creates a tiny local composition,
exports PNG, WAV and MP4, checks PNG dimensions, non-silent decoded audio, and all
six decoded video frames with an audio track. It fails rather than silently
skipping when the requested browser or native codecs cannot run. Temporary
compositions, exports and the engine are cleaned up. CI runs the same image.

When bumping Playwright or Node.js, rebuild the image and rerun the smoke job.
A successful run verifies this fixture on that image; it does not certify every
cloud provider, CPU, video codec, WebGPU effect or untrusted composition.

## Troubleshooting

- Browser download returns HTML or is unreachable: provision the compatible
  headless shell during image creation and set the executable override.
- Explicit path fails: check the file, executable permissions, browser/Playwright
  versions and missing shared libraries. The original launch error is retained
  as the error cause.
- Browser process or loopback socket creation is denied: use a host with the
  required execution capabilities. Do not treat disabling host protections as
  the fix.

References: [Playwright Docker guidance](https://playwright.dev/docs/docker),
[Playwright browser compatibility](https://playwright.dev/docs/browsers).
