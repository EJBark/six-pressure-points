module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Server configuration error: API key not set.' });

  const { responses } = req.body;
  if (!responses) return res.status(400).json({ error: 'No responses provided.' });

  const prompt = buildPrompt(responses);

  try {
    // Generate the report
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2500,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await anthropicRes.json();

    if (data.error) {
      console.error('Anthropic API error:', data.error);
      return res.status(500).json({ error: 'Report generation failed. Please try again.' });
    }

    const report = data.content[0].text.replace(/—/g, ' - ');

    // Send the report by email if we have a Resend key and recipient email
    if (resendKey && responses.email) {
      try {
        await sendReportEmail(resendKey, responses, report);
      } catch (emailErr) {
        // Log but don't fail — report still shown in browser
        console.error('Email send failed:', emailErr);
      }
    }

    return res.status(200).json({ report });
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'An unexpected error occurred.' });
  }
};

async function sendReportEmail(resendKey, r, reportMarkdown) {
  const firstName = r.first_name || '';
  const fullName = [r.first_name, r.last_name].filter(Boolean).join(' ') || 'there';
  const company = r.company || 'your organisation';
  const reportHtml = markdownToHtml(reportMarkdown);

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Your Six Pressure Points Diagnostic</title>
</head>
<body style="margin:0;padding:0;background:#faf8f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr><td style="background:#3a3a38;border-radius:12px 12px 0 0;padding:28px 36px;">
          <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#e8a987;">Elle Jane Bark</p>
          <p style="margin:4px 0 0;font-size:18px;font-weight:700;color:#f2efe9;">The Six Pressure Points</p>
          <p style="margin:2px 0 0;font-size:12px;color:#9a9895;">Diagnostic Report</p>
        </td></tr>

        <!-- Intro -->
        <tr><td style="background:#ffffff;padding:32px 36px 24px;border-left:1px solid #e8ddd5;border-right:1px solid #e8ddd5;">
          <p style="margin:0 0 16px;font-size:16px;color:#2d2b29;">Hi ${firstName || fullName},</p>
          <p style="margin:0 0 16px;font-size:15px;color:#4a4540;line-height:1.7;">Your Six Pressure Points diagnostic for <strong>${company}</strong> is below. This report identifies where pressure is concentrated across your organisation and what that pattern suggests about your current state.</p>
          <p style="margin:0;font-size:15px;color:#4a4540;line-height:1.7;">Read it carefully — the most important insights are often in how the pressure points connect to each other, not just where they show up individually.</p>
        </td></tr>

        <!-- Divider -->
        <tr><td style="background:#ffffff;padding:0 36px;border-left:1px solid #e8ddd5;border-right:1px solid #e8ddd5;">
          <hr style="border:none;border-top:1px solid #e8ddd5;margin:0;">
        </td></tr>

        <!-- Report content -->
        <tr><td style="background:#ffffff;padding:24px 36px 32px;border-left:1px solid #e8ddd5;border-right:1px solid #e8ddd5;">
          ${reportHtml}
        </td></tr>

        <!-- CTA -->
        <tr><td style="background:#f9f0eb;border:1px solid #e8c9b5;border-top:none;padding:28px 36px;">
          <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#3a3a38;">Ready to go deeper?</p>
          <p style="margin:0 0 20px;font-size:14px;color:#6b5c52;line-height:1.6;">The Diagnostic Session explores why the pressure exists, how the dimensions connect in your specific context, and what needs to change and in what order. One hour. No slides, no frameworks — just a direct conversation about what the data reveals.</p>
          <a href="https://ejbark.com.au" style="display:inline-block;background:#3a3a38;color:#f2efe9;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">Book a Diagnostic Session</a>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:24px 36px;text-align:center;">
          <p style="margin:0 0 8px;font-size:13px;color:#8a7f78;"><strong style="color:#3a3a38;">Elle Jane Bark</strong> · The Work Behind The Work</p>
          <p style="margin:0;font-size:12px;color:#a09890;">
            <a href="https://ejbark.com.au" style="color:#c8886a;text-decoration:none;">ejbark.com.au</a>
            &nbsp;·&nbsp;
            <a href="https://ejbark.com.au/privacy" style="color:#c8886a;text-decoration:none;">Privacy Policy</a>
            &nbsp;·&nbsp;
            <a href="https://ejbark.com.au/terms" style="color:#c8886a;text-decoration:none;">Terms &amp; Conditions</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Elle Jane Bark <hello@ejbark.com.au>',
      to: [r.email],
      bcc: ['hello@ejbark.com.au'],
      subject: `Your Six Pressure Points Diagnostic — ${company}`,
      html,
    })
  });

  if (!emailRes.ok) {
    const err = await emailRes.json();
    throw new Error(JSON.stringify(err));
  }
}

function markdownToHtml(md) {
  // Convert markdown report to simple email-safe HTML
  let html = '';
  const lines = md.split('\n');
  let i = 0;
  let inPressureProfile = false;
  let pendingParagraph = [];

  function flushParagraph() {
    if (pendingParagraph.length > 0) {
      const text = pendingParagraph.join(' ').trim();
      if (text) html += `<p style="margin:0 0 14px;font-size:15px;color:#4a4540;line-height:1.75;">${processInline(text)}</p>`;
      pendingParagraph = [];
    }
  }

  while (i < lines.length) {
    const line = lines[i].trim();
    if (line.startsWith('## ')) {
      flushParagraph();
      inPressureProfile = false;
    } else if (line.startsWith('### ')) {
      flushParagraph();
      const heading = line.slice(4);
      inPressureProfile = heading.toLowerCase().includes('pressure point profile');
      html += `<p style="margin:20px 0 6px;font-size:11px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:#c8886a;">${processInline(heading)}</p>`;
    } else if (line === '---') {
      flushParagraph();
      html += `<hr style="border:none;border-top:1px solid #e8ddd5;margin:18px 0;">`;
    } else if (line === '') {
      flushParagraph();
    } else if (inPressureProfile && line.startsWith('**') && line.match(/\*\*.+\*\*/)) {
      flushParagraph();
      const match = line.match(/\*\*(.+?)\*\*\s*(?:—|--)?\s*(.+)?/);
      if (match) {
        const dimName = match[1];
        const signal = (match[2] || '').trim();
        const signalColor = getSignalColor(signal);
        let desc = '';
        i++;
        while (i < lines.length && lines[i].trim() !== '' && !lines[i].trim().startsWith('**') && !lines[i].trim().startsWith('###') && !lines[i].trim().startsWith('---')) {
          desc += (desc ? ' ' : '') + lines[i].trim();
          i++;
        }
        i--;
        html += `<div style="background:#faf8f5;border-radius:8px;border:1px solid #e8ddd5;padding:14px 16px;margin-bottom:10px;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;flex-wrap:wrap;">
            <span style="font-weight:700;font-size:15px;color:#2d2b29;">${dimName}</span>
            ${signal ? `<span style="font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;padding:3px 10px;border-radius:999px;background:${signalColor.bg};color:${signalColor.text};">${signal}</span>` : ''}
          </div>
          <p style="margin:0;font-size:14px;color:#5a5550;line-height:1.65;">${processInline(desc)}</p>
        </div>`;
      }
    } else {
      pendingParagraph.push(line);
    }
    i++;
  }
  flushParagraph();
  return html;
}

function getSignalColor(signal) {
  const s = (signal || '').toLowerCase();
  if (s.includes('critical')) return { bg: '#fee2e2', text: '#b91c1c' };
  if (s.includes('elevated')) return { bg: '#ffedd5', text: '#c2410c' };
  if (s.includes('moderate')) return { bg: '#fef9c3', text: '#a16207' };
  if (s.includes('low')) return { bg: '#dcfce7', text: '#15803d' };
  return { bg: '#f3f4f6', text: '#4b5563' };
}

function processInline(text) {
  return (text || '')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

function buildPrompt(r) {
  const name = [r.first_name, r.last_name].filter(Boolean).join(' ') || 'the respondent';
  const company = r.company || 'the organisation';
  return `You are an expert organisational diagnostician working within the Six Pressure Points framework, a diagnostic tool that assesses how well an organisation is set up to do what it is supposed to do.

The Six Pressure Points are:
1. Direction: Does the organisation know where it is going?
2. Design: Is the structure built for the work they actually do?
3. Governance: Who decides what, and does it work?
4. Capability: Do they have the right people doing the right work at the right level?
5. Delivery: Is work actually getting done, and do they know why when it is not?
6. Improvement: Does the organisation learn, or just repeat?

RESPONDENT: ${name}, ${r.role || 'unspecified role'} at ${company} (${r.employees || 'unspecified size'} employees, ${r.industry || 'unspecified industry'})

ASSESSMENT RESPONSES:

CONTEXT
What prompted this review: ${r.context || 'Not provided'}

DIRECTION
1. Strategy last reviewed and what changed: ${r.direction_1 || 'Not provided'}
2. How team knows current priorities: ${r.direction_2 || 'Not provided'}
3. Decisions in last 90 days conflicting with strategy: ${r.direction_3 || 'Not provided'}
4. What 12-month success looks like — documented: ${r.direction_4 || 'Not provided'}
5. Last full-team strategy communication: ${r.direction_5 || 'Not provided'}

DESIGN
1. Documented operating model — used daily: ${r.design_1 || 'Not provided'}
2. When org structure was last reviewed: ${r.design_2 || 'Not provided'}
3. Role descriptions — coverage and currency: ${r.design_3 || 'Not provided'}
4. Roles with unclear accountability: ${r.design_4 || 'Not provided'}
5. Average direct reports per manager: ${r.design_5 || 'Not provided'}
6. Teams that regularly duplicate work: ${r.design_6 || 'Not provided'}

GOVERNANCE
1. Documented decision rights framework: ${r.governance_1 || 'Not provided'}
2. Typical time to make a significant decision: ${r.governance_2 || 'Not provided'}
3. Leadership meetings per week and purpose: ${r.governance_3 || 'Not provided'}
4. Clarity of ownership when things go wrong: ${r.governance_4 || 'Not provided'}
5. Decisions unnecessarily escalated last month: ${r.governance_5 || 'Not provided'}

CAPABILITY
1. Staff turnover rate: ${r.capability_1 || 'Not provided'}
2. Average manager tenure: ${r.capability_2 || 'Not provided'}
3. Process for identifying capability gaps: ${r.capability_3 || 'Not provided'}
4. Capability outsourced in last 12 months and why: ${r.capability_4 || 'Not provided'}
5. Where highest performers spend their time: ${r.capability_5 || 'Not provided'}

DELIVERY
1. Number of active projects/initiatives: ${r.delivery_1 || 'Not provided'}
2. Percentage of projects on track: ${r.delivery_2 || 'Not provided'}
3. How work is prioritised when overloaded: ${r.delivery_3 || 'Not provided'}
4. Visibility of what team is working on: ${r.delivery_4 || 'Not provided'}
5. What was started and not finished last quarter: ${r.delivery_5 || 'Not provided'}
6. Systems and tools used to manage work: ${r.delivery_6 || 'Not provided'}
7. How managers verify completion to standard: ${r.delivery_7 || 'Not provided'}

IMPROVEMENT
1. Formal continuous improvement process: ${r.improvement_1 || 'Not provided'}
2. Last retrospective and what changed: ${r.improvement_2 || 'Not provided'}
3. How process problems are identified and resolved: ${r.improvement_3 || 'Not provided'}
4. Mapped processes for core functions — currency: ${r.improvement_4 || 'Not provided'}
5. Problem being worked on for 12+ months: ${r.improvement_5 || 'Not provided'}
6. How improvement actions are logged and tracked: ${r.improvement_6 || 'Not provided'}

---

Generate a diagnostic report using the structure below. Write in plain, direct language — no jargon, no corporate speak. Be specific about what the responses reveal, referencing actual answers where relevant. Do not make recommendations — this report diagnoses the organisation, it does not prescribe solutions.

Format your response in clean markdown.

---

## Your Six Pressure Points Diagnostic

### What brought you here
[One sentence acknowledging what prompted this review. If not provided, use a neutral framing.]

---

### Your Pressure Point Profile

For each dimension below, write the name, a pressure signal (Critical Pressure / Elevated Pressure / Moderate Pressure / Low Pressure), and 2–3 sentences on what the responses reveal. Be specific — reference actual answers. Be honest about what the data suggests, even when the picture is not flattering.

**Direction** [signal]
[interpretation]

**Design** [signal]
[interpretation]

**Governance** [signal]
[interpretation]

**Capability** [signal]
[interpretation]

**Delivery** [signal]
[interpretation]

**Improvement** [signal]
[interpretation]

---

### Where the pressure is concentrated

[Identify the 2–3 dimensions showing the most pressure. In 3–4 sentences, explain how these pressure points connect and interact. Think systemically — where does weakness in one dimension create or amplify pressure in another?]

---

### What this tells us

[2–3 sentences that crystallise what this assessment reveals about the organisation's current state. Be direct. Name the problem clearly without being alarmist.]

---

### Your next step

The self-assessment surfaces where the pressure is. The Diagnostic Session goes a level deeper — exploring why the pressure exists, how the dimensions are connected in your specific context, and what needs to change and in what order. If the picture above feels accurate, the session is the right next step.

---

Tone: direct, credible, considered. Like a respected senior consultant who takes the reader's situation seriously. Not alarming, not generic, not flattering.`;
}
