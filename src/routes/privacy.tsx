import { createFileRoute, Link } from "@tanstack/react-router";

import { LegalPage, Section, UpdatedOn } from "@/components/legal-page";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy — grounded" },
      {
        name: "description",
        content: "What grounded collects, what it never collects, and who else can see it.",
      },
    ],
  }),
  component: PrivacyPage,
});

/**
 * The privacy policy, written from the code rather than from a template.
 *
 * Google requires a reachable privacy policy on the app's own domain before an
 * OAuth consent screen can leave Testing, and it must describe what actually
 * happens to Google user data. Everything below was checked against the schema
 * and the edge functions; where the app draws an unusual line (the journal, the
 * titles of synced events) that line is stated plainly, because a policy that is
 * vaguer than the code wastes the strongest thing there is to say.
 *
 * Public: reachable signed out, which the OAuth review requires and which is
 * also the only way it is any use to someone deciding whether to sign up.
 */
function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy"
      lead="What grounded stores, what it never stores, and who else can see it."
    >
      <UpdatedOn date="25 August 2026" />

      <Section title="The short version">
        <p>
          Grounded holds your plans so they are there on your next device. It does not sell
          anything, does not run advertising, and has no analytics that record what you write. Three
          things are worth knowing before the detail:
        </p>
        <ul>
          <li>
            <strong>Your journal is never read by the assistant.</strong> Not the entries, not the
            moods, not the gratitude notes. The assistant is built with a list of what it may see
            and the journal is not on it.
          </li>
          <li>
            <strong>
              Titles of calendar events synced from Google, Outlook or a feed never leave the app.
            </strong>{" "}
            The assistant is told an hour is taken, never what it is for.
          </li>
          <li>
            <strong>Usage measurement records feature names and timestamps only</strong> — never the
            content of anything you write.
          </li>
        </ul>
      </Section>

      <Section title="What you give it">
        <p>
          <strong>Your account.</strong> An email address and a password, handled by Supabase Auth.
          Passwords are stored by Supabase as salted hashes and are never visible to us. If you set
          a device passcode, only a hash of it is stored.
        </p>
        <p>
          <strong>What you put in.</strong> Tasks, goals and their steps, projects, habits and the
          days you ticked them, courses, calendar entries you create, focus sessions, journal
          entries including mood and gratitude, and your settings. This is the point of the app; it
          is stored so it is there when you come back.
        </p>
      </Section>

      <Section title="Connected calendars">
        <p>
          Connecting Google Calendar or Outlook is optional and read-only. Grounded requests only
          the permission needed to read events; it cannot create, change or delete anything in your
          calendar.
        </p>
        <p>What is stored when you connect:</p>
        <ul>
          <li>
            An access token and a refresh token, so events can be fetched without asking you to sign
            in every time. These are held server-side and are never sent to your browser.
          </li>
          <li>
            The account&rsquo;s identifier and email address, so the app can show you which account
            a calendar came from.
          </li>
          <li>
            A copy of your upcoming events &mdash; title, date and time &mdash; so they can be shown
            alongside your own entries.
          </li>
        </ul>
        <p>
          <strong>How that data is used.</strong> Only to display your schedule back to you inside
          your own account. It is never sold, never used for advertising, never used to train or
          improve any AI model, and never shared with anyone else. This is Grounded&rsquo;s use of
          Google user data and it complies with the{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noreferrer noopener"
          >
            Google API Services User Data Policy
          </a>
          , including its Limited Use requirements.
        </p>
        <p>
          Disconnecting a calendar in Profile deletes the stored tokens and the imported events. You
          can also revoke access at any time from your{" "}
          <a
            href="https://myaccount.google.com/permissions"
            target="_blank"
            rel="noreferrer noopener"
          >
            Google account permissions
          </a>{" "}
          page, independently of Grounded.
        </p>
      </Section>

      <Section title="The assistant">
        <p>
          If you use the assistant, your message and a summary of your current plans are sent to
          OpenRouter, which routes them to a language model provider to generate a reply.
        </p>
        <p>
          What is included in that summary: your display name, goals and steps, tasks, projects,
          habits, courses, and your schedule for the next three weeks.
        </p>
        <p>What is excluded, always:</p>
        <ul>
          <li>Journal entries, moods and gratitude notes.</li>
          <li>
            The titles of events synced from Google, Outlook or a subscribed feed. A synced event
            appears to the assistant only as a busy period at a particular time.
          </li>
          <li>Your passcode and your calendar tokens.</li>
        </ul>
        <p>
          If you type something into the chat yourself, it is sent &mdash; that is your choice, and
          it is the only route by which anything from your journal could reach the model.
        </p>
      </Section>

      <Section title="Usage measurement">
        <p>
          During the pilot, Grounded records which features are used: a short event name such as{" "}
          <code>task_add</code>, the page it happened on, your account id and the time. There is no
          field for content anywhere in that pipeline, and the database rejects anything that is not
          a short machine-shaped name.
        </p>
        <p>
          It also records errors &mdash; the message, the technical stack trace, the page and your
          browser version &mdash; so faults can be fixed. Only the pilot administrator can read
          either of these.
        </p>
      </Section>

      <Section title="Sharing, and only when you ask">
        <p>
          Nothing you store is visible to anyone else unless you create a share link. A share link
          is a read-only view of the areas you choose, at an unguessable address, with an expiry
          date. Anyone holding the link can open it, so treat it like the contents themselves. You
          can revoke a link at any time in Profile, which takes effect immediately.
        </p>
      </Section>

      <Section title="Who else is involved">
        <ul>
          <li>
            <strong>Supabase</strong> &mdash; database, authentication and server functions. Your
            data lives here.
          </li>
          <li>
            <strong>Vercel</strong> &mdash; serves the app itself.
          </li>
          <li>
            <strong>OpenRouter</strong> and the model provider it routes to &mdash; only when you
            use the assistant, and only what is listed above.
          </li>
          <li>
            <strong>Google</strong> and <strong>Microsoft</strong> &mdash; only if you connect those
            calendars, and only to read them.
          </li>
        </ul>
        <p>
          Nobody is sent your data for their own purposes. There is no advertising network, no data
          broker and no tracking pixel in this app.
        </p>
      </Section>

      <Section title="Keeping and deleting">
        <p>
          Your data stays until you remove it. <strong>Clear all my data</strong> in Profile deletes
          your tasks, goals, habits, journal, events, courses, projects, focus sessions and settings
          straight away. Deleting a connected calendar removes its tokens and imported events.
        </p>
        <p>
          To delete the account itself, email the address below and it will be removed, along with
          everything attached to it. Error reports are kept without the account link, because a
          report is about the app rather than about you.
        </p>
      </Section>

      <Section title="Security, honestly stated">
        <p>
          Every table is protected by row-level security, so one account cannot read another&rsquo;s
          rows even if the app were asked to. Calendar tokens are only ever handled server-side.
          Traffic is encrypted in transit.
        </p>
        <p>
          Grounded is a small project in a pilot, not a hardened enterprise product. It has not been
          independently audited. That is worth knowing before you put anything in it that would
          genuinely harm you if it leaked.
        </p>
      </Section>

      <Section title="Children">
        <p>Grounded is not intended for anyone under 16 and is not directed at children.</p>
      </Section>

      <Section title="Changes and contact">
        <p>
          If this policy changes in a way that affects what is collected or who sees it, the date at
          the top changes and anyone with an account is told before it takes effect.
        </p>
        <p>
          Questions, or a deletion request:{" "}
          <a href="mailto:eliaquineb@gmail.com">eliaquineb@gmail.com</a>.
        </p>
        <p className="text-sm">
          See also the <Link to="/terms">terms of use</Link>.
        </p>
      </Section>
    </LegalPage>
  );
}
