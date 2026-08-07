import React from "react";

export type EditorialCollageThemeProps = {
  billId: string;
  /** Dry / official title — used as fallback when humanHook is omitted. */
  title: string;
  category: string;
  keyImpacts: string[];
  /**
   * Human-centric magazine hook shown in the header banner.
   * Example: "TRADEMARK PROTECTIONS ARE GETTING A MAJOR FEDERAL UPGRADE"
   */
  humanHook?: string;
  /**
   * Conversational prompt inside the sticker capsule.
   * Example: "Should Congress pass this protection?"
   */
  promptQuestion?: string;
  /** Optional editorial photograph / media URL. */
  imageSrc?: string;
  imageAlt?: string;
  /** Anchored vote / Ask AI bar — rendered under TL;DR, never over artwork. */
  actionBar?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
};

function defaultPrompt(category: string): string {
  const topic = category.trim() || "this bill";
  return `Should Congress pass this ${topic.toLowerCase()}?`;
}

/**
 * Theme #1 — Editorial Collage
 * Portrait artwork frame (3:4) + TL;DR column. Mobile stacks art above copy;
 * desktop places art left and TL;DR / actions right. Vote bar never overlays art.
 */
export function EditorialCollageTheme({
  billId,
  title,
  category,
  keyImpacts,
  humanHook,
  promptQuestion,
  imageSrc,
  imageAlt,
  actionBar,
  children,
  className = "",
}: EditorialCollageThemeProps) {
  const hook = (humanHook ?? title).trim();
  const prompt = (promptQuestion ?? defaultPrompt(category)).trim();
  const impacts = keyImpacts.slice(0, 2);

  return (
    <div
      className={[
        "editorial-collage",
        "relative isolate overflow-hidden rounded-[1.75rem]",
        "bg-[#FDF8F2] text-[#1C1410]",
        "px-4 pb-5 pt-5 sm:px-6 sm:pt-7 md:px-8",
        "font-['Source_Sans_3','Avenir_Next','Segoe_UI',sans-serif]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-theme="editorial-collage"
      data-a1-theme="editorial-collage"
    >
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-70"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 10% 0%, rgba(214,168,98,0.22), transparent 55%), radial-gradient(ellipse 60% 40% at 95% 15%, rgba(176,120,72,0.12), transparent 50%)",
        }}
      />

      <header className="editorial-collage__header relative mb-5 flex items-start gap-3 sm:mb-6 sm:gap-4">
        <div className="min-w-0 flex-1">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8A6A45]">
            {category}
          </p>
          <h2
            className={[
              "editorial-collage__hook",
              "font-['Fraunces','Libre_Baskerville',Georgia,serif]",
              "text-[1.35rem] font-bold leading-[1.12] tracking-[-0.02em]",
              "text-[#1C1410] sm:text-[1.75rem] md:text-[2rem]",
              "uppercase",
            ].join(" ")}
          >
            {hook}
          </h2>
        </div>

        <div
          className={[
            "editorial-collage__stamp",
            "relative shrink-0",
            "flex h-[4.25rem] w-[4.25rem] sm:h-[4.75rem] sm:w-[4.75rem]",
            "items-center justify-center",
            "rounded-full border-[2.5px] border-[#1C1410]",
            "bg-[#F7EDE0] text-center",
            "-rotate-6 shadow-[2px_3px_0_rgba(28,20,16,0.12)]",
          ].join(" ")}
          aria-label={`Bill ${billId}`}
        >
          <span
            className="absolute inset-1 rounded-full border border-dashed border-[#1C1410]/35"
            aria-hidden
          />
          <span className="relative px-1.5 text-[10px] font-bold uppercase leading-tight tracking-wide text-[#1C1410] sm:text-[11px]">
            {billId}
          </span>
        </div>
      </header>

      {/* Mobile: stack · Desktop: art left / TL;DR+actions right */}
      <div className="editorial-collage__layout flex flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-5">
        <div className="editorial-collage__art w-full shrink-0 lg:w-[min(42%,20rem)]">
          <div
            className={[
              "editorial-collage__frame",
              "relative w-full overflow-hidden rounded-[1.25rem]",
              "border-[3px] border-[#1C1410]",
              "bg-[#1C1410] shadow-[0_18px_40px_rgba(28,20,16,0.18)]",
              "aspect-[3/4]",
            ].join(" ")}
          >
            {imageSrc ? (
              <img
                src={imageSrc}
                alt={imageAlt ?? hook}
                className="absolute inset-0 h-full w-full object-contain contrast-[1.08] saturate-[1.05]"
              />
            ) : (
              <div
                className="editorial-collage__placeholder absolute inset-0"
                aria-hidden
              >
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(145deg, #2A221C 0%, #4A3428 42%, #1A1410 100%)",
                  }}
                />
                <div className="absolute -right-6 top-8 h-40 w-40 rotate-12 rounded-[2rem] bg-[#D6A862]/35 blur-[1px]" />
                <div className="absolute left-8 top-10 h-24 w-36 -rotate-6 rounded-full bg-[#FDF8F2]/12" />
                <div className="absolute inset-0 flex items-start p-5 sm:p-6">
                  <span className="max-w-[12rem] font-['Fraunces',Georgia,serif] text-lg font-semibold leading-snug text-[#FDF8F2]/90 sm:text-xl">
                    Editorial frame
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="editorial-collage__copy flex min-w-0 flex-1 flex-col gap-3">
          <div
            className={[
              "editorial-collage__sticker",
              "relative z-10 rounded-[1.5rem] border border-[#E8D9C6] bg-[#FFFCF7]",
              "px-4 py-4 shadow-[0_12px_32px_rgba(28,20,16,0.12)]",
              "sm:px-5 sm:py-5",
            ].join(" ")}
          >
            {impacts.length > 0 ? (
              <section aria-label="Key impacts" className="mb-4">
                <h3 className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#8A6A45]">
                  Key Impacts
                </h3>
                <ul className="flex flex-col gap-2.5">
                  {impacts.map((impact, index) => (
                    <li
                      key={`${billId}-editorial-impact-${index}`}
                      className="flex gap-2.5 text-[0.95rem] leading-snug text-[#2A2118]"
                    >
                      <span
                        className="mt-[0.35em] h-1.5 w-1.5 shrink-0 rounded-full bg-[#C47A3A]"
                        aria-hidden
                      />
                      <span className="font-medium">{impact}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <p
              className={[
                "editorial-collage__prompt",
                "font-['Fraunces','Libre_Baskerville',Georgia,serif]",
                "text-base font-semibold leading-snug text-[#1C1410]",
                "sm:text-lg",
              ].join(" ")}
            >
              {prompt}
            </p>

            {children ? (
              <div className="editorial-collage__slot mt-4">{children}</div>
            ) : null}
          </div>

          {actionBar ? (
            <footer className="editorial-collage__footer mt-auto">{actionBar}</footer>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default EditorialCollageTheme;
