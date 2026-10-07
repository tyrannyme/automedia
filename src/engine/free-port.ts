import net from "node:net";

export async function findFreePort(): Promise<number> {
  const probe = net.createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const address = probe.address();
  // SAFETY: the probe is bound to TCP and therefore reports AddressInfo here;
  // the string form is only used for Unix-domain sockets.
  const addressInfo = address as net.AddressInfo;
  if (!address || !Number.isInteger(addressInfo.port)) {
    probe.close();
    throw new Error("failed to find a free TCP port");
  }
  const port = addressInfo.port;
  await new Promise<void>((resolve, reject) => {
    probe.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}
