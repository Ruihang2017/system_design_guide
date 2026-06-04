// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
  site: 'https://system-design-guide.netlify.app',
  integrations: [
    starlight({
      title: 'From POC to Production',
      description:
        'A self-study system design guide for engineers who can build, and now want to design things that survive scale, failure, and time.',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/ruihang2017/system_design_guide',
        },
      ],
      editLink: {
        baseUrl: 'https://github.com/ruihang2017/system_design_guide/edit/main/',
      },
      lastUpdated: true,
      sidebar: [
        {
          label: 'Overview',
          items: [
            { label: 'Welcome', link: '/' },
            { label: 'Introduction · How to use', link: '/introduction/' },
          ],
        },
        {
          label: 'Core Mindset',
          items: [
            { label: '0 · Functional vs Non-Functional', link: '/mindset/non-functional-requirements/' },
            { label: '1 · Estimation & Numbers', link: '/mindset/estimation/' },
            { label: '2 · Consistency, CAP & Correctness', link: '/mindset/consistency-cap/' },
          ],
        },
        {
          label: 'Building Blocks',
          items: [
            { label: '3 · Communication & Networking', link: '/building-blocks/networking/' },
            { label: '4 · Databases & Storage', link: '/building-blocks/databases/' },
            { label: '5 · Caching', link: '/building-blocks/caching/' },
            { label: '6 · Messaging & Async', link: '/building-blocks/messaging/' },
            { label: '7 · Architecture Patterns', link: '/building-blocks/architecture-patterns/' },
            { label: '8 · Reliability & Resilience', link: '/building-blocks/reliability/' },
            { label: '9 · Observability & Delivery', link: '/building-blocks/observability/' },
            { label: '10 · Specialized Components', link: '/building-blocks/specialized-components/' },
          ],
        },
        {
          label: 'The Method',
          items: [
            { label: '11 · Design Framework', link: '/method/framework/' },
            { label: 'Interview Checklist', link: '/method/interview-checklist/' },
          ],
        },
        {
          label: 'Case Studies',
          items: [
            { label: 'URL Shortener', link: '/case-studies/url-shortener/' },
            { label: 'News Feed / Twitter', link: '/case-studies/news-feed/' },
            { label: 'Chat / WhatsApp', link: '/case-studies/chat-whatsapp/' },
            { label: 'Distributed Rate Limiter', link: '/case-studies/rate-limiter/' },
            { label: 'Practice Problem Bank', link: '/case-studies/practice-problems/' },
          ],
        },
        {
          label: 'Interview Prep',
          items: [
            { label: 'Question Bank', link: '/interview-prep/question-bank/' },
            { label: 'Concept → Tradeoff Flashcards', link: '/interview-prep/flashcards/' },
          ],
        },
        {
          label: 'Study & Resources',
          items: [
            { label: 'Study Plan', link: '/resources/study-plan/' },
            { label: 'Canonical Resources', link: '/resources/reading/' },
            { label: 'Prompts to Fan Out', link: '/resources/fan-out-prompts/' },
          ],
        },
      ],
    }),
  ],
});
