// Agent 05 (search & AI discovery) and Agent 06 (art direction + rendering).
import path from 'node:path';
import { prompt, wrap } from '../lib/prompt.mjs';
import { note } from '../lib/job.mjs';
import { draftAssetDir, articleAssetUrl } from '../lib/render-image.mjs';

// ---------------------------------------------------------------- 05 seo
export async function seoAgent(ctx) {
  const { job, llm, log } = ctx;
  const draft = job.artifacts.draft || {};
  const corpus = ctx.corpus || [];

  const { data, costUsd } = await llm.run({
    task: 'seo',
    system: prompt('05-seo.md'),
    user: wrap({
      topic: job.topic,
      category: job.category,
      title: draft.title,
      description: draft.description,
      answerFirst: draft.answerFirst,
      body: draft.body,
      existingArticles: corpus.map((c) => ({ title: c.title, slug: c.slug, url: `/articles/${c.slug}/`, tags: c.tags })),
      categories: ctx.categories || [],
    }),
  });

  const before = { title: draft.title, slug: draft.slug };
  draft.seoTitle = data.seoTitle;
  draft.title = data.seoTitle || draft.title;
  draft.description = data.metaDescription || draft.description;
  draft.slug = data.slug || draft.slug;
  draft.faq = data.faq || [];
  draft.llmsSummary = data.llmsSummary;
  draft.internalLinks = data.internalLinks || [];

  job.artifacts.seo = { ...data, previousTitle: before.title, previousSlug: before.slug };
  note(job, 'seo:done', `slug ${draft.slug}`);
  log(`  seo: slug="${draft.slug}" · ${(data.faq || []).length} FAQ`);
  return { costUsd };
}

// ---------------------------------------------------------------- 06 images
export async function imageAgent(ctx) {
  const { job, llm, image, log } = ctx;
  const draft = job.artifacts.draft || {};
  const slug = draft.slug;

  const { data, costUsd } = await llm.run({
    task: 'image',
    system: prompt('06-image.md'),
    user: wrap({
      topic: job.topic,
      title: draft.title,
      answerFirst: draft.answerFirst,
      outline: (job.artifacts.brief?.outline || []).map((o) => o.h2),
      category: job.category,
    }),
  });

  const dir = draftAssetDir(slug);
  const hero = await image.generate({
    prompt: data.hero?.prompt || `Editorial abstract artwork about ${job.topic}, deep navy, electric blue, 16:9`,
    seed: `${slug}:hero`,
    motif: job.category,
    outPathBase: path.join(dir, 'hero'),
    width: 1600,
    height: 900,
  });

  draft.hero = {
    src: articleAssetUrl(slug, `hero.${hero.ext}`),
    alt: (data.hero?.alt || `Editorial artwork for ${draft.title}`).slice(0, 120),
    width: hero.width,
    height: hero.height,
    provider: hero.provider,
  };

  // Inline figures: rendered, then inserted directly under their anchor H2.
  const figures = (data.figures || []).slice(0, 3);
  const placed = [];
  let body = draft.body || '';
  for (let i = 0; i < figures.length; i++) {
    const f = figures[i];
    const res = await image.generate({
      prompt: f.prompt,
      seed: `${slug}:fig${i + 1}`,
      motif: job.category,
      outPathBase: path.join(dir, `fig-${i + 1}`),
      width: 1600,
      height: 900,
    });
    const md = `\n![${f.alt}](${articleAssetUrl(slug, `fig-${i + 1}.${res.ext}`)}${f.caption ? ` "${f.caption}"` : ''})\n`;
    const anchor = `## ${f.afterH2}`;
    if (f.afterH2 && body.includes(anchor)) {
      body = body.replace(anchor, `${anchor}\n${md}`);
    } else {
      body += `\n${md}`;
    }
    placed.push({ ...f, src: articleAssetUrl(slug, `fig-${i + 1}.${res.ext}`), width: res.width, height: res.height });
  }
  draft.body = body;
  draft.figures = placed;

  job.artifacts.images = { hero: draft.hero, figures: placed, concept: data.concept };
  note(job, 'images:done', `${1 + placed.length} image(s) · ${hero.provider}`);
  log(`  images: 1 hero + ${placed.length} figure(s) via ${hero.provider}`);
  return { costUsd };
}
