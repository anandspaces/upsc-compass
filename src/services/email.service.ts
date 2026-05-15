import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailProvider {
  send(msg: EmailMessage): Promise<void>;
}

class SmtpEmailProvider implements EmailProvider {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor() {
    if (!env.SMTP_HOST || !env.SMTP_PORT || !env.SMTP_USER || !env.SMTP_PASSWORD) {
      throw new Error("SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD are required");
    }
    const secure = env.SMTP_SECURE ?? env.SMTP_PORT === 465;
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    });
    this.from = `"${env.EMAIL_FROM_NAME}" <${env.EMAIL_FROM}>`;
  }

  async send(msg: EmailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      ...(msg.html ? { html: msg.html } : {}),
    });
  }
}

let _provider: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (_provider) return _provider;
  _provider = new SmtpEmailProvider();
  return _provider;
}

export function setEmailProvider(p: EmailProvider): void {
  _provider = p;
}

export function resetEmailProvider(): void {
  _provider = null;
}

export async function sendOtpEmail(to: string, code: string): Promise<void> {
  const provider = getEmailProvider();
  await provider.send({
    to,
    subject: `Your ${env.EMAIL_FROM_NAME} verification code`,
    text: [
      `Your verification code is: ${code}`,
      "",
      `This code expires in ${env.OTP_EXPIRY_MINUTES} minutes.`,
      "If you didn't request this, you can ignore this email.",
    ].join("\n"),
  });
}
