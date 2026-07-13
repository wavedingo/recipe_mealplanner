import { ImapFlow } from 'imapflow';
import { parseRecipeFromUrl } from '@/lib/recipe-parser';
import { prisma } from '@/lib/db';

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;

export interface PollResult {
  processed: number;
  errors: string[];
}

export async function pollEmailForRecipes(): Promise<PollResult> {
  const user = process.env.IMAP_USER;
  const pass = process.env.IMAP_PASSWORD;

  if (!user || !pass) {
    console.log('[imap-poller] IMAP credentials not configured, skipping.');
    return { processed: 0, errors: [] };
  }

  const importEmail = (process.env.IMPORT_USER_EMAIL ?? process.env.HOUSEHOLD_EMAIL ?? '')
    .trim()
    .toLowerCase();
  const importUser = importEmail
    ? await prisma.user.findUnique({ where: { email: importEmail } })
    : null;
  if (!importUser) {
    return {
      processed: 0,
      errors: ['Email import: IMPORT_USER_EMAIL / HOUSEHOLD_EMAIL is not set or does not match a user'],
    };
  }

  const client = new ImapFlow({
    host: process.env.IMAP_HOST || 'imap.bluehost.com',
    port: parseInt(process.env.IMAP_PORT || '993', 10),
    secure: true,
    auth: { user, pass },
    logger: process.env.NODE_ENV !== 'production' ? undefined : false,
  });

  let processed = 0;
  const errors: string[] = [];

  try {
    await client.connect();

    const lock = await client.getMailboxLock('INBOX');
    try {
      // Search for unseen messages
      const searchResult = await client.search({ seen: false });
      const uids: number[] = Array.isArray(searchResult) ? searchResult : [];

      if (uids.length === 0) {
        console.log('[imap-poller] No unseen messages found.');
        return { processed: 0, errors: [] };
      }

      console.log(`[imap-poller] Found ${uids.length} unseen message(s).`);

      for await (const message of client.fetch(uids, {
        source: true,
      })) {
        const source = message.source;
        if (!source) continue;
        const bodyText = source.toString('utf-8');
        const urls = [...new Set(bodyText.match(URL_REGEX) ?? [])];

        for (const url of urls) {
          try {
            const parsed = await parseRecipeFromUrl(url);

            await prisma.recipe.create({
              data: {
                userId: importUser.id,
                title: parsed.title,
                description: parsed.description,
                sourceUrl: url,
                imageUrl: parsed.imageUrl,
                servings: parsed.servings,
                prepTimeMins: parsed.prepTimeMins,
                cookTimeMins: parsed.cookTimeMins,
                ingredients: parsed.ingredients as object[],
                steps: parsed.steps as object[],
                tags: { create: [] },
              },
            });

            processed++;
            console.log(`[imap-poller] Saved recipe: "${parsed.title}" from ${url}`);
          } catch (err) {
            // Silently skip duplicate URL errors (P2002 - unique constraint violation)
            if (err instanceof Object && 'code' in err && err.code === 'P2002') {
              console.log(`[imap-poller] Recipe from ${url} already exists, skipping.`);
            } else {
              const msg = `Failed to parse/save recipe from ${url}: ${err instanceof Error ? err.message : String(err)}`;
              console.error(`[imap-poller] ${msg}`);
              errors.push(msg);
            }
          }
        }

        // Mark as read
        try {
          await client.messageFlagsAdd(message.uid, ['\\Seen'], { uid: true });
        } catch (err) {
          const msg = `Failed to mark message ${message.uid} as read: ${err instanceof Error ? err.message : String(err)}`;
          console.error(`[imap-poller] ${msg}`);
          errors.push(msg);
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (err) {
    const msg = `IMAP connection error: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[imap-poller] ${msg}`, err);
    errors.push(msg);
  }

  return { processed, errors };
}
