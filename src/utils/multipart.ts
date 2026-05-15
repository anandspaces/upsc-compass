import type { IncomingMessage } from "node:http";
import { Errors } from "./errors";

export interface ParsedField {
  name: string;
  value: string;
}

export interface ParsedFile {
  name: string;
  filename: string;
  contentType: string;
  data: Buffer;
}

export interface ParsedMultipart {
  fields: Record<string, string>;
  files: Record<string, ParsedFile>;
}

const CRLF = Buffer.from("\r\n");
const DASH_DASH = Buffer.from("--");

function readBody(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let received = 0;
    let aborted = false;

    req.on("data", (chunk: Buffer) => {
      if (aborted) return;
      received += chunk.length;
      if (received > maxBytes) {
        aborted = true;
        reject(Errors.fileTooLarge(maxBytes));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!aborted) resolve(Buffer.concat(chunks));
    });
    req.on("error", (err) => {
      if (!aborted) reject(err);
    });
  });
}

function parseContentDisposition(header: string): { name?: string; filename?: string } {
  const out: { name?: string; filename?: string } = {};
  // Example: form-data; name="pdfFile"; filename="report.pdf"
  const parts = header.split(";").map((p) => p.trim());
  for (const part of parts) {
    const m = part.match(/^([\w-]+)=(?:"([^"]*)"|([^;]*))$/);
    if (m) {
      const key = m[1]?.toLowerCase();
      const value = m[2] ?? m[3] ?? "";
      if (key === "name") out.name = value;
      else if (key === "filename") out.filename = value;
    }
  }
  return out;
}

function parsePartHeaders(headerBuf: Buffer): Record<string, string> {
  const text = headerBuf.toString("utf8");
  const lines = text.split("\r\n").filter((l) => l.length > 0);
  const headers: Record<string, string> = {};
  for (const line of lines) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    headers[key] = value;
  }
  return headers;
}

function indexOf(haystack: Buffer, needle: Buffer, start: number): number {
  return haystack.indexOf(needle, start);
}

export async function parseMultipart(
  req: IncomingMessage,
  options: { maxBytes: number },
): Promise<ParsedMultipart> {
  const contentType = req.headers["content-type"] ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    throw Errors.invalidUpload("Content-Type must be multipart/form-data.");
  }
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i);
  const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2];
  if (!boundary) {
    throw Errors.invalidUpload("Missing multipart boundary in Content-Type header.");
  }

  const body = await readBody(req, options.maxBytes);
  const delimiter = Buffer.concat([CRLF, DASH_DASH, Buffer.from(boundary)]);
  const firstBoundary = Buffer.concat([DASH_DASH, Buffer.from(boundary)]);

  // Locate the first boundary (no leading CRLF for the very first one).
  let cursor = body.indexOf(firstBoundary);
  if (cursor === -1) throw Errors.invalidUpload("Malformed multipart body.");
  cursor += firstBoundary.length;

  const fields: Record<string, string> = {};
  const files: Record<string, ParsedFile> = {};

  while (cursor < body.length) {
    // Check for trailing "--" (end of stream).
    if (body[cursor] === 0x2d && body[cursor + 1] === 0x2d) break;
    // Skip optional CRLF after boundary.
    if (body[cursor] === 0x0d && body[cursor + 1] === 0x0a) cursor += 2;

    const headerEnd = indexOf(body, Buffer.from("\r\n\r\n"), cursor);
    if (headerEnd === -1) throw Errors.invalidUpload("Malformed multipart part headers.");
    const headers = parsePartHeaders(body.subarray(cursor, headerEnd));
    const partBodyStart = headerEnd + 4;

    const nextBoundary = indexOf(body, delimiter, partBodyStart);
    if (nextBoundary === -1) throw Errors.invalidUpload("Unterminated multipart part.");
    const partBody = body.subarray(partBodyStart, nextBoundary);

    const disposition = headers["content-disposition"];
    if (!disposition) {
      throw Errors.invalidUpload("Multipart part missing Content-Disposition header.");
    }
    const { name, filename } = parseContentDisposition(disposition);
    if (!name) {
      throw Errors.invalidUpload("Multipart part missing field name.");
    }

    if (filename !== undefined) {
      files[name] = {
        name,
        filename,
        contentType: headers["content-type"] ?? "application/octet-stream",
        data: Buffer.from(partBody),
      };
    } else {
      fields[name] = partBody.toString("utf8");
    }

    cursor = nextBoundary + delimiter.length;
  }

  return { fields, files };
}
