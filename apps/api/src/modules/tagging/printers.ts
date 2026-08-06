/**
 * Printer profiles, hardware identification and job delivery.
 *
 * THE DESIGN: nothing above this file knows what a printer is. Labels are
 * designed in millimetres (domain/tagging/label-layout) and rendered by
 * interchangeable back ends (ZPL / TSPL / HTML). A Printer profile only
 * answers two questions — which language, and how does the job get there.
 *
 * IDENTIFICATION: a profile may be registered as `language: AUTO` before
 * anyone knows the brand. `POST /printers/:id/identify` opens a socket and
 * asks the device who it is:
 *   - Zebra answers `~HI` with "<model>,<firmware>,<dpi>,<memory>"
 *   - TSPL units answer `~!T` (and `~!@`) with a model/version string
 * Whichever replies decides the language, and the model is stored.
 *
 * DELIVERY (`connection`):
 *   BROWSER  — hand back HTML; the shop PC's own driver prints it. No setup.
 *   DOWNLOAD — hand back the raw command file to send to the printer.
 *   NETWORK  — push raw commands to host:port (9100). LAN deployments only:
 *              a cloud-hosted API cannot reach a printer on the shop's LAN.
 */
import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Socket } from 'node:net';
import { PrinterLanguage } from '@erp/shared';

/** How long to wait for a printer to answer / accept a job. */
const PROBE_TIMEOUT_MS = 3_000;
const SEND_TIMEOUT_MS = 10_000;

export interface IdentifyResult {
  language: PrinterLanguage;
  model: string | null;
  raw: string;
}

/**
 * Open a socket, write `payload`, and collect whatever comes back until the
 * device goes quiet or the timeout expires. Rejects with a useful message
 * rather than a bare socket error — this surfaces straight into the UI.
 */
export function probeSocket(
  host: string,
  port: number,
  payload: string,
  timeoutMs = PROBE_TIMEOUT_MS,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    let received = '';
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      fn();
    };

    socket.setTimeout(timeoutMs);
    socket.on('data', (chunk) => {
      received += chunk.toString('latin1');
    });
    // Printers often hold the connection open after replying; treat the
    // timeout as "done talking" and keep whatever arrived.
    socket.on('timeout', () => finish(() => (received ? resolve(received) : reject(new Error(`no reply from ${host}:${port} within ${timeoutMs}ms`)))));
    socket.on('error', (err) => finish(() => reject(new Error(`cannot reach ${host}:${port} — ${err.message}`))));
    socket.on('close', () => finish(() => resolve(received)));

    socket.connect(port, host, () => socket.write(payload));
  });
}

/** Send a raw job and resolve once it has been flushed to the device. */
export function sendSocket(host: string, port: number, job: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };
    socket.setTimeout(SEND_TIMEOUT_MS);
    socket.on('timeout', () => finish(() => { socket.destroy(); reject(new Error(`timed out sending to ${host}:${port}`)); }));
    socket.on('error', (err) => finish(() => { socket.destroy(); reject(new Error(`cannot reach ${host}:${port} — ${err.message}`)); }));
    socket.connect(port, host, () => {
      socket.end(job, () => finish(() => { socket.destroy(); resolve(); }));
    });
  });
}

/**
 * Classify a printer's identification reply. PURE — unit-testable without
 * hardware. Zebra's `~HI` reply is comma-separated and starts with the
 * model; TSPL devices answer with their own model/version banner.
 */
export function classifyIdentity(reply: string): IdentifyResult {
  const raw = reply.trim();
  const text = raw.replace(/[\x00-\x1f]/g, ' ').trim();

  // Zebra ~HI → "ZD230-203dpi,V45.11.7Z,8,4096KB" (often wrapped in STX/ETX)
  if (/\bZ[DTQ]?\w*\d|zebra|,V\d+\.\d+/i.test(text)) {
    const model = text.split(',')[0]?.trim() || null;
    return { language: PrinterLanguage.ZPL, model, raw };
  }
  // TSPL: TSC/Godex/Argox banners
  if (/\bTSC\b|godex|argox|\bTTP-|\bTE\d|\bDA\d/i.test(text)) {
    const model = text.split(/[,\s]/).find((w) => w.length > 2) ?? null;
    return { language: PrinterLanguage.TSPL, model, raw };
  }
  return { language: PrinterLanguage.AUTO, model: null, raw };
}

@Injectable()
export class PrinterIoService {
  /**
   * Ask a network printer what it is. Tries the Zebra probe first, then the
   * TSPL one; the first recognisable answer wins.
   */
  async identify(host: string, port: number): Promise<IdentifyResult> {
    const attempts: string[] = [];
    for (const probe of ['~HI', '~!T']) {
      try {
        const reply = await probeSocket(host, port, probe);
        attempts.push(reply);
        const result = classifyIdentity(reply);
        if (result.language !== PrinterLanguage.AUTO) return result;
      } catch (err) {
        // A refused connection means there is nothing there at all — stop.
        const msg = err instanceof Error ? err.message : String(err);
        if (/ECONNREFUSED|EHOSTUNREACH|ENOTFOUND/.test(msg)) {
          throw new ServiceUnavailableException(msg);
        }
      }
    }
    if (attempts.length === 0) {
      throw new ServiceUnavailableException(`printer at ${host}:${port} did not answer identification`);
    }
    // It answered, but in a dialect we do not recognise — report honestly
    // rather than guessing a language and printing garbage.
    return { language: PrinterLanguage.AUTO, model: null, raw: attempts.join(' | ') };
  }

  /** Push a rendered job to a network printer. */
  async send(host: string | null, port: number, job: string): Promise<void> {
    if (!host) throw new BadRequestException('network printer has no host configured');
    await sendSocket(host, port, job);
  }
}
