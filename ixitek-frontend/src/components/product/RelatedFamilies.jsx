import SectionHeading from "../ui/SectionHeading.jsx";
import FamilyCard from "./FamilyCard.jsx";

export default function RelatedFamilies({ families }) {
  if (!families.length) return null;
  return (
    <section className="border-t border-ink-100 bg-ink-50/40 py-14">
      <div className="container-page">
        <SectionHeading eyebrow="Keep exploring" title="Related product families" />
        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {families.map((f, i) => (
            <FamilyCard key={f.id} family={f} toneIndex={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
