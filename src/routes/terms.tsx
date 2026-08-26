import { createFileRoute, Link } from "@tanstack/react-router";

import { LegalPage, Section, UpdatedOn } from "@/components/legal-page";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms — grounded" },
      { name: "description", content: "The terms of use for grounded, in plain language." },
    ],
  }),
  component: TermsPage,
});

/**
 * Terms of use. Required alongside the privacy policy before Google will let an
 * OAuth consent screen leave Testing.
 *
 * Written plainly and kept short on purpose. A pilot of a few dozen people does
 * not need a licensing agreement, and a wall of capitalised boilerplate would
 * sit badly on an app whose whole manner is calm — but the parts that genuinely
 * protect both sides during a pilot (no warranty, it may break, back up what
 * matters) are stated clearly rather than buried.
 */
function TermsPage() {
  return (
    <LegalPage title="Terms of use" lead="The agreement, in plain language.">
      <UpdatedOn date="25 August 2026" />

      <Section title="What this is">
        <p>
          Grounded is a personal planner, run by Mulanga Banza, currently in a private pilot. Using
          it means accepting what is on this page. If you do not, please do not use it.
        </p>
      </Section>

      <Section title="Your account">
        <p>
          You need an account, and you are responsible for what happens under it &mdash; keep the
          password to yourself. Tell us if you think someone else has got into it.
        </p>
        <p>
          During the pilot, accounts are created for named testers. Please do not pass your login on
          to anyone else; ask instead and they can have their own.
        </p>
      </Section>

      <Section title="What you put in is yours">
        <p>
          Everything you write stays yours. Grounded claims no ownership of it and does not use it
          to build anything else. The only permission taken is the one required to run the app for
          you: storing your content, showing it back to you, and sending it where you have asked it
          to go &mdash; the assistant, or a share link you created.
        </p>
      </Section>

      <Section title="Fair use">
        <p>Please do not:</p>
        <ul>
          <li>use Grounded for anything illegal, or to store anything illegal;</li>
          <li>try to reach another person&rsquo;s account or data;</li>
          <li>
            hammer the assistant or the sync in a way that degrades it for other testers &mdash; it
            runs on shared, rate-limited services;
          </li>
          <li>resell it or present it as your own product.</li>
        </ul>
        <p>
          Accounts doing these things can be suspended, though during a pilot the first step will
          always be a conversation.
        </p>
      </Section>

      <Section title="Connected calendars">
        <p>
          Connecting Google Calendar or Outlook is optional and read-only: Grounded reads your
          events and cannot change them. You can disconnect in Profile, or revoke access from the
          provider, at any time. What is stored and for how long is set out in the{" "}
          <Link to="/privacy">privacy policy</Link>.
        </p>
        <p>
          Those services are not ours. If a provider changes its terms, expires a token or has an
          outage, sync stops until it is reconnected. Grounded shows that state plainly rather than
          pretending everything is fine.
        </p>
      </Section>

      <Section title="The assistant">
        <p>
          The assistant is a language model. It gets things wrong, and it is not a professional of
          any kind &mdash; not a doctor, not a therapist, not a lawyer, not a financial adviser.
          Treat what it says as a suggestion for arranging your week, nothing more.
        </p>
        <p>
          If you are struggling with your mental health, please talk to a real person who is
          qualified to help. This app is a planner, and it is not a substitute for care.
        </p>
      </Section>

      <Section title="Share links">
        <p>
          A share link is readable by anyone who has it. You choose what it covers and when it
          expires, and you can revoke it at any time &mdash; but anything already seen has already
          been seen. Share deliberately.
        </p>
      </Section>

      <Section title="It is a pilot, and it may break">
        <p>
          Grounded is provided as it is, with no warranty of any kind. It may be unavailable, lose
          data, or change without notice while the pilot runs. Features may appear and disappear.
        </p>
        <p>
          <strong>Keep your own copy of anything you cannot afford to lose.</strong> That is not a
          formality &mdash; it is honest advice about a young product.
        </p>
        <p>
          As far as the law allows, liability for any loss arising from use of Grounded is limited
          to nothing, since nothing has been paid for it. Nothing here limits liability for death or
          personal injury caused by negligence, or for fraud.
        </p>
      </Section>

      <Section title="Ending it">
        <p>
          You can stop at any time. <strong>Clear all my data</strong> in Profile removes your
          content immediately, and emailing the address below removes the account itself.
        </p>
        <p>
          The pilot can be ended, or an account closed, with reasonable notice &mdash; and you will
          be given a chance to take your data out first.
        </p>
      </Section>

      <Section title="Changes and contact">
        <p>
          If these terms change, the date at the top changes and anyone with an account is told.
          Continuing to use Grounded after that means accepting the new version.
        </p>
        <p>These terms are governed by the laws of the Commonwealth of Virginia, United States.</p>
        <p>
          Anything at all: <a href="mailto:eliaquineb@gmail.com">eliaquineb@gmail.com</a>.
        </p>
        <p className="text-sm">
          See also the <Link to="/privacy">privacy policy</Link>.
        </p>
      </Section>
    </LegalPage>
  );
}
