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

  const client = new ImapFlow({
    host: process.env.IMAP_HOST || 'imap.bluehost.com',
    port: parseInt(process.env.IMAP_PORT || '993', 10),
    secure: true,
    auth: { user, pass },
    logger: false,
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
        const urls = bodyText.match(URL_REGEX) ?? [];

        for (const url of urls) {
          try {
            const parsed = await parseRecipeFromUrl(url);

            await prisma.recipe.create({
              data: {
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
            const msg = `Failed to parse/save recipe from ${url}: ${err instanceof Error ? err.message : String(err)}`;
            console.error(`[imap-poller] ${msg}`);
            errors.push(msg);
          }
        }

        // Mark as read
        try {
          await client.messageFlagsAdd(message.uid, ['\\Seen'], { uid: true });
        } catch (err) {
          console.error(
            `[imap-poller] Failed to mark message ${message.uid} as read: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (err) {
    const msg = `IMAP connection error: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[imap-poller] ${msg}`);
    errors.push(msg);
  }

  return { processed, errors };
}
