import type { JsonLd as JsonLdData } from '@/lib/domain/seo/jsonld';

/**
 * Renders one or more JSON-LD blocks. Structured data is injected as a script
 * tag with the schema serialised server-side; `<` is escaped to prevent any
 * chance of breaking out of the script context.
 */
export function JsonLd({ schema }: { schema: JsonLdData | JsonLdData[] }) {
  const blocks = Array.isArray(schema) ? schema : [schema];
  return (
    <>
      {blocks.map((block, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(block).replace(/</g, '\\u003c'),
          }}
        />
      ))}
    </>
  );
}
