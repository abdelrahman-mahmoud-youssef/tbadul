import { z } from 'zod';
import { err, ok } from '../../../domain/result.ts';
import type { RequestSigner } from '../../../ports/request-signer.ts';
import { decodeJson, failureForStatus, type HttpClient } from '../../http/http-client.ts';

const signatureReply = z.object({
  status: z.literal('ok'),
  data: z.object({
    signed_url: z.url(),
    cookies: z.string(),
    navigator: z.object({ user_agent: z.string() }),
  }),
});

export const sidecarSigner = (client: HttpClient, sidecarUrl: string): RequestSigner => ({
  sign: async (url, signal) => {
    const reply = await client.postJson(`${sidecarUrl}/signature`, { url }, signal);
    if (!reply.ok) return reply;
    if (reply.value.status !== 200) return err(failureForStatus(reply.value.status, 'signer'));
    const decoded = decodeJson(reply.value, signatureReply);
    if (!decoded.ok) return decoded;
    const { signed_url, cookies, navigator } = decoded.value.data;
    return ok({
      url: signed_url,
      headers: { 'user-agent': navigator.user_agent, cookie: cookies },
    });
  },
});
