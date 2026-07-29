# Cold Email Sequences — PrivacyCode Enterprise

## Sequence A: CISO / Security Leader

### Email 1 (Day 0) — The Problem
```
Subject: AI coding at {company}?

Hi {first_name},

Quick one — do your devs use AI coding tools (Claude, ChatGPT, Copilot)?

Most eng teams I talk to already do. The problem is that code pasted into these tools often contains API keys, customer PII, or proprietary logic that ends up on third-party servers.

I built PrivacyCode — an open-source CLI that tokenizes sensitive data before it reaches AI providers. PHI, credentials, PII — all replaced on-device. Nothing sensitive ever leaves your machine.

For SOC 2 / HIPAA orgs, this means:
- Devs use any AI tool
- Provider never sees real data
- No BAA needed
- Full audit trail

Worth 30 min to see a live demo?

Best,
[Your name]
```

### Email 2 (Day 4) — Case Study
```
Subject: How a HIPAA org deployed AI tools in 2 days

Hi {first_name},

Following up on my last email.

We recently deployed PrivacyCode at a HIPAA-covered organization with 50 engineers. They went from "no AI tools allowed" to full Claude/GPT access with compliance sign-off.

Key result: PHI never reached the AI provider because it was tokenized on-device before transmission. No BAA needed.

I put together a one-page summary. Happy to share it.

Is this relevant to what you're working on?

Best,
[Your name]
```

### Email 3 (Day 10) — Direct Ask
```
Subject: AI compliance at {company}

Hi {first_name},

One more try — I know you're busy.

If your devs are asking for AI coding tools and compliance is blocking them, I can help.

PrivacyCode is open source, deploys in 2 days, and gives you audit evidence for SOC 2 / HIPAA.

If it's not a priority right now, no worries at all.

That said — if you know someone else at {company} who owns this, I'd appreciate the intro.

Best,
[Your name]
```

---

## Sequence B: VP Engineering / CTO

### Email 1 (Day 0) — Speed/Dev Focus
```
Subject: AI coding at {company}?

Hi {first_name},

Your devs want AI coding tools. Compliance is blocking it.

I built PrivacyCode — an open-source CLI that runs silently on dev machines and tokenizes PII/PHI/credentials before anything reaches the AI provider.

No proxy. No cloud. No change to how your devs work.

Deployed at HIPAA orgs in 2 days.

Want to see a 2-min demo?

Best,
[Your name]
```

### Email 2 (Day 4) — Technical
```
Subject: How tokenization works (no proxy, no cloud)

Hi {first_name},

Following up — a bit more technical this time.

PrivacyCode intercepts prompts on-device, scans for 18+ PII/PHI patterns, replaces them with deterministic tokens, then sends only the safe version to the AI provider.

Zero telemetry. MIT licensed. You can verify every line.

github.com/profullstack/getprivacycode

Happy to walk through the architecture if you're interested.

Best,
[Your name]
```

### Email 3 (Day 10) — Close
```
Subject: Re: AI coding at {company}

Hi {first_name},

Last try — if AI coding compliance isn't your priority right now, no problem.

But if you want your devs to have AI tools without the compliance headache, I can get you there in 2 days.

Let me know if that's useful.

Best,
[Your name]
```

---

## Templates for Replies

### If they ask "how is this different from [competitor]?"

Good question. Most AI governance tools are cloud proxies — all prompts route through their servers for scanning.

PrivacyCode tokenizes on-device. Nothing sensitive ever reaches the network.

For HIPAA, this is the key difference: with a cloud proxy, you need a BAA with the proxy vendor AND the AI provider. With PrivacyCode, PHI never leaves the machine, so no BAA needed at all.

Also: open source, zero telemetry, self-hostable.

### If they say "we're not ready yet"

Totally understand. Most companies are still figuring out their AI policy.

When you're ready, the tool will be here — it's open source and free. If you need deployment help, I offer a compliance assessment that identifies exactly where your AI data exposure risks are.

No pressure. Happy to reconnect in a few months.

### If they ask "pricing?"

PrivacyCode itself is free and open source.

For deployment and compliance readiness, I offer:
- Starter: $299/mo (up to 10 devs, remote setup, training)
- Compliance: $1,500/mo (SOC 2/HIPAA, audit logs, SSO, custom patterns)
- Enterprise: Custom (self-hosted, air-gapped, unlimited)

Or if you want to self-deploy, everything you need is on GitHub.

### If they say "I want to try it first"

Perfect. It's free and open source:

curl -fsSL https://getprivacycode.com/install | sh

Then run:
privacycode

It works immediately with OpenAI or Claude. Tokenization is on by default.

Let me know if you hit any issues — happy to help with the setup.
