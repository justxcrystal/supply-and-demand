import { createServerFn } from "@tanstack/react-start";

export const askAmd = createServerFn({ method: "POST" })
  .validator((d: unknown) => {
    const o = d as { snapshot?: string };
    if (!o?.snapshot?.trim()) throw new Error("empty snapshot");
    return { snapshot: o.snapshot.slice(0, 1800) };
  })
  .handler(async ({ data }): Promise<{ ok: true; text: string } | { ok: false; error: string }> => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false, error: "AI is not available" };
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        max_tokens: 380,
        messages: [
          {
            role: "system",
            content:
              "You are an AMD / supply-demand desk coach. Be terse. Only recommend a trade on a distribution retest with the 20/50 trend. Trail BE at TP2 then two TPs back. Auto target is TP6. Never place orders. If blocked, say wait.",
          },
          { role: "user", content: data.snapshot },
        ],
      }),
    });
    if (!res.ok) return { ok: false, error: `xAI API error ${res.status}` };
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return { ok: true, text: body.choices?.[0]?.message?.content ?? "" };
  });

export const imagineCatch = createServerFn({ method: "POST" })
  .validator((d: unknown) => {
    const o = d as { prompt?: string };
    if (!o?.prompt?.trim()) throw new Error("empty prompt");
    return { prompt: o.prompt.slice(0, 1400) };
  })
  .handler(async ({ data }): Promise<{ ok: true; src: string } | { ok: false; error: string }> => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false, error: "AI is not available" };
    const res = await fetch("https://api.x.ai/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-imagine-image",
        prompt: data.prompt,
        n: 1,
        resolution: "1k",
        response_format: "url",
      }),
    });
    if (!res.ok) return { ok: false, error: `Imagine ${res.status}` };
    const body = (await res.json()) as { data?: { url?: string }[] };
    const src = body.data?.[0]?.url;
    if (!src) return { ok: false, error: "No image" };
    try {
      const img = await fetch(src);
      if (!img.ok) return { ok: true, src };
      const buf = Buffer.from(await img.arrayBuffer());
      const mime = img.headers.get("content-type") || "image/jpeg";
      return { ok: true, src: `data:${mime};base64,${buf.toString("base64")}` };
    } catch {
      return { ok: true, src };
    }
  });
