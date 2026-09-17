// SAP / ERP Training, Implementation & Support — micro-site content model.
//
// Legal note (see the "Legal.docx" guidance this content was built from):
// Ixitek is an independent consultancy. We describe our consultants' skills
// and certifications using SAP as a nominative reference (identifying the
// technology, not implying partnership). We never claim to be an "SAP
// Implementation Provider/Center", never display SAP logos or screenshots,
// and always frame certifications as held by individuals, not the company.
// The trademark disclaimer rendered in <SapFooterBand> covers every page.

export const sapDisclaimer =
  "SAP®, S/4HANA®, Fiori®, SuccessFactors®, Ariba®, Concur® and other SAP product names mentioned on this site are trademarks or registered trademarks of SAP SE in Germany and other countries. Ixitek Solutions is an independent provider of SAP-related training, implementation and support services. We are not affiliated with, sponsored by, or endorsed by SAP SE. Where we refer to certifications, these are held by individual consultants, not by Ixitek as a corporate entity.";

export const sapNav = [
  { label: "Overview", to: "/sap", icon: "LayoutDashboard", end: true },
  { label: "Training", to: "/sap/training", icon: "GraduationCap" },
  { label: "Implementation", to: "/sap/implementation", icon: "Workflow" },
  { label: "Support", to: "/sap/support", icon: "LifeBuoy" },
  { label: "Industries", to: "/sap/industries", icon: "Factory" },
  { label: "FAQs", to: "/sap/faq", icon: "MessageCircle" },
];

export const sapHero = {
  eyebrow: "Ixitek · Independent SAP® Consulting",
  headline: "Build SAP® skills. Deploy SAP® systems. Keep them running.",
  subheadline:
    "End-to-end SAP training, implementation and application support, delivered by independent consultants with real project experience across finance, supply chain, manufacturing and HR.",
  ctas: [
    { label: "Explore Training Courses", to: "/sap/training", variant: "primary" },
    { label: "Request an Implementation Proposal", to: "/sap/implementation", variant: "secondary" },
    { label: "Talk to a Support Specialist", to: "/sap/support", variant: "ghost" },
  ],
};

export const sapIntro = {
  paragraphs: [
    "SAP runs the core of thousands of organizations worldwide, from finance and procurement to manufacturing, logistics, sales and human resources. Getting value from that investment depends on three things: people who know how to use the system, a clean and well-governed implementation, and dependable day-to-day support.",
    "Our consultants combine classroom and virtual training, full-lifecycle implementation using the SAP Activate methodology, and managed application support that keeps your landscape stable, secure and current — whether you're moving to SAP S/4HANA for the first time, rolling out a cloud solution, or upskilling an existing team.",
  ],
};

export const sapPillars = [
  {
    id: "training",
    icon: "GraduationCap",
    title: "Training",
    to: "/sap/training",
    description:
      "Instructor-led and self-paced SAP courses across functional, technical and cloud tracks. Hands-on system access, real business scenarios and certification preparation. Public batches, corporate batches or one-to-one coaching.",
  },
  {
    id: "implementation",
    icon: "Workflow",
    title: "Implementation",
    to: "/sap/implementation",
    description:
      "Greenfield implementations, brownfield conversions and selective data transitions delivered through the six phases of SAP Activate — blueprinting, configuration, data migration, integration, testing, cutover and hypercare.",
  },
  {
    id: "support",
    icon: "LifeBuoy",
    title: "Support",
    to: "/sap/support",
    description:
      "Application management covering incident resolution, enhancements, release and patch management, performance tuning and user administration. Flexible coverage from business hours to round-the-clock.",
  },
];

export const sapTrustStats = [
  { id: "consultants", value: 25, suffix: "+", label: "SAP-certified consultants on staff" },
  { id: "modules", value: 25, suffix: "", label: "SAP modules taught & supported" },
  { id: "projects", value: 40, suffix: "+", label: "Implementation & rollout projects" },
  { id: "countries", value: 2, suffix: "", label: "Countries served, IN & US" },
];

export const sapAbout = {
  whoWeAre: [
    "We are an independent, SAP-focused services team built around a single idea: technology only creates value when people can use it and trust it. Our consultants come from operational backgrounds in finance, supply chain, manufacturing and human resources, so they explain SAP in the language of the business rather than the language of the software.",
    "We work with organizations across manufacturing, retail, pharmaceuticals, automotive, energy, logistics, public sector and professional services. Some engage us for a single certification course. Others hand us an entire landscape to implement and then manage — the same standard of rigor applies to both.",
  ],
  approach: [
    {
      title: "Business first",
      description: "We start with the process, not the transaction code. Configuration follows a documented business requirement every time.",
    },
    {
      title: "Certified and current",
      description: "Our consultants hold active, individually-earned SAP certifications and re-certify as releases change.",
    },
    {
      title: "Transparent delivery",
      description: "Fixed scope, fixed milestones, weekly status reporting and no hidden change orders.",
    },
    {
      title: "Knowledge transfer by default",
      description: "Every implementation includes structured handover so your team is never dependent on us indefinitely.",
    },
    {
      title: "Long-term partnership",
      description: "Most of our support clients started as training or implementation clients — and stayed.",
    },
  ],
  values: [
    { id: "integrity", title: "Integrity", description: "We tell you what a project will realistically take, including when the answer is inconvenient." },
    { id: "craft", title: "Craft", description: "We hold ourselves to configuration and code standards that survive audit and upgrade." },
    { id: "accessibility", title: "Accessibility", description: "Our trainers answer questions after the session ends, not only during it." },
    { id: "learning", title: "Continuous learning", description: "Every consultant carries an annual training and certification allowance." },
  ],
};

export const sapWhyChooseUs = [
  { icon: "BadgeCheck", title: "Certified & Experienced Consultants", description: "Every person who teaches a course has delivered that module on live projects — learners hear about the errors that actually occur, not only the documented happy path." },
  { icon: "Workflow", title: "One Partner Across the Full Lifecycle", description: "Training, implementation and support are usually bought from three suppliers. We cover all three, so the team that configures your system can train your users and support it long after." },
  { icon: "MonitorSmartphone", title: "Hands-On System Access", description: "Every training engagement includes genuine system access — learners configure, post, run and correct in a real environment, with practice access continuing after the course." },
  { icon: "RefreshCw", title: "Curriculum Aligned to Current Releases", description: "Course material is reviewed against each significant SAP release. Where a legacy approach remains widely deployed, we teach both and explain the difference." },
  { icon: "FileText", title: "Transparent Commercial Terms", description: "Fixed-scope proposals, published course fees, clear inclusions and a documented change process — no unexplained variation, no surprise invoices." },
  { icon: "Headset", title: "Continued Access to Expertise", description: "Learners retain a question channel after the course. Support clients receive a named service manager rather than an anonymous ticket queue." },
];

// ---------------------------------------------------------------------------
// Training
// ---------------------------------------------------------------------------

export const sapTraining = {
  overview: [
    "Our training practice exists to make SAP users independent. Courses are built around live system access, realistic master data and end-to-end business scenarios rather than isolated screen walkthroughs. Learners finish able to run a process start to finish, troubleshoot common errors, and explain the configuration behind what they're doing.",
    "We deliver functional, technical, cloud and end-user training across the SAP portfolio, aligned to current SAP certification syllabi and updated as SAP releases change.",
  ],
  deliveryModes: [
    { icon: "Building2", title: "Instructor-Led Classroom", description: "Face-to-face sessions at our training centre or your premises. Small batch sizes, dedicated system access per learner and printed workbooks." },
    { icon: "MonitorSmartphone", title: "Instructor-Led Virtual", description: "Live online sessions over video conferencing with remote system access. Same curriculum, same instructor engagement, no travel. Sessions are recorded." },
    { icon: "PlayCircle", title: "Self-Paced Online", description: "Structured video modules, downloadable exercise guides and scheduled system access windows, with periodic instructor checkpoints and a question forum." },
    { icon: "Users2", title: "Corporate Batch Training", description: "A private cohort from one organization, curriculum adjusted to your configuration and master data — the most effective format for go-live readiness." },
    { icon: "GraduationCap", title: "One-to-One Coaching", description: "Focused sessions for individuals preparing for certification, moving into a new module, or working through a specific project challenge." },
  ],
  includes: [
    "Live SAP system access for the course duration and a defined practice period afterward",
    "Course workbook covering configuration steps, transaction codes and process flows",
    "Real business scenarios drawn from live project experience",
    "Graded practice exercises with instructor feedback",
    "Certification preparation including question banks and mock examinations",
    "Course completion certificate",
    "Post-course question support for a defined period",
    "Session recordings for virtual and corporate batches",
  ],
  certification: {
    paragraphs: [
      "SAP certification is a recognized marker of capability and frequently a hiring requirement. We prepare learners for associate and specialist-level certifications across functional, technical and cloud tracks — a syllabus-mapped revision plan, topic-weighted question banks, timed mock examinations and a review session covering commonly misread question patterns.",
      "We advise on which certification path suits a given career stage and how to maintain certification as SAP moves to its current release cadence. Examination booking guidance is provided; the examination itself is booked and administered directly by SAP.",
    ],
  },
  audience: [
    "Graduates and career changers entering the SAP ecosystem for the first time",
    "Functional consultants adding a second module or moving from ECC to SAP S/4HANA",
    "Technical developers and administrators building ABAP, BASIS, Fiori or integration skills",
    "Business users preparing for a go-live or joining an organization that already runs SAP",
    "Project teams needing a shared baseline before a blueprint workshop",
    "Managers and process owners who need enough fluency to make informed design decisions",
  ],
  structure: {
    paragraphs: [
      "A standard functional course runs across a defined number of sessions, each combining a concept briefing, a guided system demonstration and independent hands-on practice. The sequence moves from enterprise structure and master data, through core transactions, into configuration, then integration with adjacent modules, closing with reporting, common errors and certification revision.",
      "Course duration varies by module and learner background. We publish an indicative schedule for every course and confirm the final plan after a short skills assessment, so the batch starts at the right level.",
    ],
  },
};

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export const sapImplementation = {
  overview: [
    "An SAP implementation succeeds or fails on discipline. Scope has to be defined before configuration begins, data has to be cleansed before it's migrated, integrations have to be designed before they're built, and users have to be trained before they're asked to go live. We run implementations to that discipline using the SAP Activate methodology, adapted to the size and risk profile of the engagement.",
    "We deliver new implementations, system conversions from SAP ECC to SAP S/4HANA, selective data transitions, rollouts to additional countries or legal entities, and targeted module additions to an existing landscape.",
  ],
  types: [
    { icon: "Sparkles", title: "New Implementation", description: "A clean build on SAP S/4HANA or an SAP cloud solution, designed around standard processes and current best practice — free of accumulated custom code." },
    { icon: "RefreshCw", title: "System Conversion", description: "A technical conversion of an existing SAP ECC system to SAP S/4HANA, preserving configuration, history and custom developments where justified." },
    { icon: "GitMerge", title: "Selective Data Transition", description: "A hybrid path carrying forward selected configuration, company codes or historical data into a newly built system — between greenfield and brownfield." },
    { icon: "Globe2", title: "Rollout & Template Deployment", description: "Extension of an established global template to a new country, subsidiary or business unit, covering localisation, language, tax and reporting." },
  ],
  phases: [
    { step: "01", title: "Discover", deliverable: "Digital discovery report & value case", description: "Understanding the current landscape, business drivers and constraints. Readiness assessment, process review, module scoping and an indicative effort, timeline and cost model." },
    { step: "02", title: "Prepare", deliverable: "Project charter & approved plan", description: "Project setup — governance structure, steering committee, project plan, resource allocation, system provisioning and documentation standards." },
    { step: "03", title: "Explore", deliverable: "Signed business blueprint & gap register", description: "Fit-to-standard workshops where the standard SAP process is demonstrated and requirements are tested against it. Gaps are logged, assessed and resolved." },
    { step: "04", title: "Realize", deliverable: "Configured, tested system & validated data load", description: "Configuration, development, data migration build, integration build, authorisation design and iterative testing, in sprints with regular playback." },
    { step: "05", title: "Deploy", deliverable: "Live production system & cutover log", description: "End-user training, UAT, cutover rehearsal, final data migration, go-live and immediate stabilisation under a detailed cutover plan." },
    { step: "06", title: "Run", deliverable: "Stabilised system & signed handover to support", description: "Hypercare and transition to steady-state support — defect resolution, performance monitoring, user handholding and knowledge transfer." },
  ],
  workstreams: [
    "Business process design and fit-to-standard analysis",
    "Configuration across all in-scope modules",
    "Custom development in ABAP, including RESTful application programming where appropriate",
    "Data migration covering extraction, cleansing, mapping, load and reconciliation",
    "Integration design and build using SAP Integration Suite and supported connectivity patterns",
    "Authorisation and role design aligned to segregation-of-duties requirements",
    "Test management covering unit, string, integration, regression and UAT",
    "Change management, communication planning and end-user training",
    "Cutover planning, rehearsal and execution",
    "Documentation covering configuration, developments, interfaces and operating procedures",
  ],
  deliverables: [
    "A signed business blueprint documenting every in-scope process",
    "A fully configured system with configuration rationale documented against each setting",
    "Technical specifications and source documentation for every custom development",
    "A data migration reconciliation pack proving completeness and accuracy of the load",
    "Interface specifications and monitoring procedures for every integration",
    "A role matrix and segregation-of-duties assessment",
    "Test scripts, test results and defect closure evidence",
    "End-user training material and quick reference guides",
    "A cutover plan and a completed cutover log",
    "A support handover pack covering known issues, workarounds and escalation paths",
  ],
};

// ---------------------------------------------------------------------------
// Support
// ---------------------------------------------------------------------------

export const sapSupport = {
  overview: [
    "An SAP system is never finished. Business processes change, regulations change, volumes grow, SAP releases new versions, and users need help. Our application management service takes ownership of that ongoing work so your internal team can focus on business change rather than ticket handling.",
    "We provide incident resolution, service requests, small enhancements, release and patch management, monitoring, performance tuning, security administration and periodic health checks under a defined service level agreement.",
  ],
  scope: [
    { icon: "AlertCircle", title: "Incident Management", description: "Logging, triage, diagnosis and resolution of production issues across functional and technical areas, tracked against response and resolution targets. Root cause analysis for recurring and high-severity incidents." },
    { icon: "ClipboardList", title: "Service Requests", description: "Routine operational tasks — user creation and role assignment, master data corrections, report scheduling, output configuration, period-end assistance and non-production refreshes." },
    { icon: "Sparkles", title: "Enhancements & Small Changes", description: "Configuration changes, new reports, form modifications, interface adjustments and workflow updates through a controlled change process with impact assessment and testing." },
    { icon: "RefreshCw", title: "Release & Patch Management", description: "Planning and executing support package upgrades, kernel updates, enhancement package deployment and cloud release adoption, with regression testing and rollback planning." },
    { icon: "Gauge", title: "Monitoring & Performance", description: "Proactive monitoring of availability, background job success, interface queues, database growth, memory usage and long-running transactions, with tuning recommendations." },
    { icon: "ShieldCheck", title: "Security & Authorisations", description: "Role maintenance, user lifecycle administration, segregation-of-duties reviews, audit support and remediation of authorisation findings." },
  ],
  engagementModels: [
    { icon: "Clock", title: "Business Hours Support", description: "Coverage during your working day in a single time zone — suited to one-region operations with predictable volumes." },
    { icon: "Globe2", title: "Extended Hours Support", description: "A longer daily window spanning multiple regional working days, with on-call cover for critical incidents outside that window." },
    { icon: "LifeBuoy", title: "Round-the-Clock Support", description: "Continuous coverage every day of the year through a follow-the-sun model — for global operations and continuous manufacturing." },
    { icon: "Users2", title: "Dedicated Team", description: "A named team assigned exclusively to your landscape, embedded in your governance and available on your communication channels." },
  ],
  serviceLevels: {
    paragraphs: [
      "Service levels are agreed at contract signature and monitored monthly. Priority categories are defined jointly so severity reflects genuine business impact rather than user perception. A typical structure defines four priorities, each with a response target and a resolution target, escalation thresholds and named escalation contacts on both sides.",
      "We publish a monthly service report covering ticket volumes by category and priority, service level attainment, recurring issue analysis, change activity, system health indicators and a forward plan of recommended improvements — reviewed in a formal monthly service review meeting.",
    ],
  },
  transition: {
    paragraphs: [
      "Taking over support of an existing landscape follows a structured transition. We begin with a discovery phase covering system inventory, custom code, interfaces, batch schedules and open issues. A shadowing phase follows, where our analysts work alongside the incumbent team. We then move to reverse shadowing — we lead, the incumbent observes — before assuming full ownership.",
      "Typical transition duration is agreed after discovery and is proportionate to landscape complexity.",
    ],
  },
};

// ---------------------------------------------------------------------------
// SAP modules — 25 modules across 4 families
// ---------------------------------------------------------------------------

export const moduleFamilies = [
  {
    id: "core-erp",
    slug: "core-erp",
    name: "Core ERP Functional Modules",
    icon: "Layers3",
    description:
      "The classic functional modules that form the operational backbone of an SAP ERP system — the foundation of most SAP careers, with concepts that carry directly into SAP S/4HANA.",
  },
  {
    id: "s4hana-lob",
    slug: "s4hana-lines-of-business",
    name: "SAP S/4HANA Lines of Business",
    icon: "Rocket",
    description:
      "The current-generation ERP suite, built on the in-memory HANA database and organised around lines of business — simplified data model, embedded analytics and the Fiori experience.",
  },
  {
    id: "cloud",
    slug: "cloud-solutions",
    name: "SAP Cloud Solutions",
    icon: "Cloud",
    description:
      "Subscribed cloud applications that address specific business domains, connecting to the digital core through SAP Integration Suite and prebuilt integration content.",
  },
  {
    id: "technical",
    slug: "technical-modules",
    name: "SAP Technical Modules",
    icon: "Code2",
    description:
      "The technical layer underpinning every functional deployment — development, administration, user experience, integration and security. Skills that transfer across every functional area.",
  },
];

export const sapModules = [
  // ---- Core ERP Functional Modules ----
  {
    slug: "fi-financial-accounting",
    familySlug: "core-erp",
    code: "FI",
    name: "Financial Accounting",
    icon: "Landmark",
    overview:
      "SAP FI is the statutory accounting engine of the SAP system. It records every financially relevant transaction in real time, maintains the general ledger, and produces the balance sheet, profit & loss statement and regulatory reports required in each country of operation. Because every other module posts into FI, it acts as the single source of financial truth for the enterprise.",
    keyFunctions: [
      "General Ledger accounting with a unified journal and real-time posting",
      "Accounts Payable — vendor invoices, payment runs, down payments, ageing",
      "Accounts Receivable — customer invoices, incoming payments, dunning, credit exposure",
      "Asset Accounting — acquisition, depreciation, transfer, revaluation, retirement",
      "Bank Accounting — house banks, statement processing, reconciliation, cash journal",
      "Tax determination, calculation, posting and statutory reporting by country",
      "Parallel accounting through multiple ledgers for local, group and management reporting",
      "Period-end and year-end closing, including accruals and foreign currency valuation",
    ],
    benefits: [
      "A closing process measured in days rather than weeks",
      "Compliance with local statutory requirements in every operating country",
      "Immediate visibility of cash position, receivables ageing and payables commitment",
      "A complete, unbroken audit trail from source document to financial statement",
    ],
    audience:
      "Accountants, finance analysts, controllers, audit professionals and commerce/finance graduates. SAP FI is the most widely deployed functional module and the most common entry point into SAP consulting.",
  },
  {
    slug: "co-controlling",
    familySlug: "core-erp",
    code: "CO",
    name: "Controlling",
    icon: "Calculator",
    overview:
      "SAP CO is the internal management-accounting counterpart to Financial Accounting. Where FI answers to external regulators, CO answers to management — tracking where costs originate, how they flow through the organization, what each product or service actually costs to deliver, and which parts of the business are genuinely profitable.",
    keyFunctions: [
      "Cost Element Accounting classifying every cost and revenue in the controlling area",
      "Cost Centre Accounting — overhead by responsibility area with planning and variance analysis",
      "Internal Orders for defined activities, events or capital projects",
      "Product Cost Controlling — cost estimates, cost object controlling, variance calculation",
      "Profitability Analysis — margin by product, customer, region and channel",
      "Profit Centre Accounting producing internal balance sheets by business segment",
      "Activity-Based Costing allocating overhead by genuine cost drivers",
      "Integrated planning and budgeting with actual-to-plan comparison",
    ],
    benefits: [
      "Accurate product costing supporting defensible pricing and margin decisions",
      "Early identification of cost overruns through variance analysis",
      "Clear accountability — every cost sits with an owning responsibility area",
      "Profitability visibility that financial statements alone cannot provide",
    ],
    audience:
      "Cost accountants, management accountants, FP&A professionals and manufacturing finance specialists. Frequently learned alongside SAP FI — the combined FICO skill set remains one of the most sought-after in the SAP market.",
  },
  {
    slug: "mm-materials-management",
    familySlug: "core-erp",
    code: "MM",
    name: "Materials Management",
    icon: "Package",
    overview:
      "SAP MM governs everything an organization buys and everything it holds in stock — the complete procure-to-pay cycle from requirement through purchasing, goods receipt, invoice verification and payment, plus accurate inventory quantities and values at every storage location.",
    keyFunctions: [
      "Material master and vendor master data governance",
      "Purchase requisition creation, approval workflow and conversion to purchase order",
      "RFQ, quotation comparison and source-of-supply determination",
      "Purchase order processing — contracts, scheduling agreements, outline agreements",
      "Goods receipt, goods issue, transfer posting and stock transport orders",
      "Inventory management with real-time stock overview by plant and storage location",
      "Logistics invoice verification with three-way matching",
      "Vendor evaluation and supplier performance measurement",
    ],
    benefits: [
      "Lower procurement cost through consolidated demand and negotiated contracts",
      "Reduced working capital tied up in excess or obsolete inventory",
      "Fewer invoice disputes through automated order/receipt/invoice matching",
      "Full material traceability for quality, recall and audit purposes",
    ],
    audience:
      "Procurement and purchasing professionals, inventory and warehouse managers, supply chain analysts. SAP MM integrates tightly with Production Planning, Sales & Distribution and Quality Management.",
  },
  {
    slug: "sd-sales-distribution",
    familySlug: "core-erp",
    code: "SD",
    name: "Sales and Distribution",
    icon: "Truck",
    overview:
      "SAP SD manages the complete order-to-cash cycle — customer enquiries, quotations, sales orders, availability commitments, delivery, shipping and billing — feeding the resulting receivables directly into Financial Accounting.",
    keyFunctions: [
      "Customer master data, sales area structure and partner function determination",
      "Enquiry and quotation processing with validity control",
      "Sales order processing — standard, rush, cash, consignment and third-party orders",
      "Pricing and conditions — price lists, discounts, surcharges, freight, rebates",
      "Availability check and transfer of requirements to planning",
      "Credit management with limit checking and order blocking",
      "Delivery processing, picking, packing, transportation planning",
      "Billing — invoices, credit/debit memos, invoice lists, billing plans",
    ],
    benefits: [
      "Shorter order-to-cash cycle and faster revenue collection",
      "Consistent, controlled pricing across customers, channels and regions",
      "Reliable delivery commitments backed by a real availability check",
      "Reduced credit exposure through automated limit enforcement at order entry",
    ],
    audience:
      "Sales operations professionals, customer service and order management staff, distribution coordinators. SAP SD pairs naturally with SAP MM and SAP PP for a complete logistics profile.",
  },
  {
    slug: "pp-production-planning",
    familySlug: "core-erp",
    code: "PP",
    name: "Production Planning",
    icon: "Factory",
    overview:
      "SAP PP plans and controls the manufacturing process — translating demand into a feasible production plan, determining materials and capacity requirements, releasing orders to the shop floor, and recording confirmations and consumption as production proceeds.",
    keyFunctions: [
      "Bill of material, work centre, routing and production version master data",
      "Sales and operations planning translating business plans into production targets",
      "Material Requirements Planning generating planned orders and requisitions",
      "Capacity requirements planning, levelling and finite scheduling",
      "Discrete, repetitive and process manufacturing (recipes, orders)",
      "Shop floor control — order release, availability check, confirmation",
      "Kanban and lean replenishment",
      "Production order settlement to controlling and variance analysis",
    ],
    benefits: [
      "Higher on-time delivery through realistic, capacity-aware scheduling",
      "Reduced material shortages and less unplanned expediting",
      "Better asset utilisation — capacity constraints visible before commitment",
      "Accurate production cost capture supporting reliable product costing",
    ],
    audience:
      "Production planners, manufacturing engineers, plant operations managers and industrial engineering graduates. Prior shop floor exposure is a genuine advantage.",
  },
  {
    slug: "qm-quality-management",
    familySlug: "core-erp",
    code: "QM",
    name: "Quality Management",
    icon: "ClipboardCheck",
    overview:
      "SAP QM embeds quality control into the operational process rather than treating it as a separate activity — defining what must be inspected, triggering inspections automatically at the right point in procurement, production and delivery, recording results, and managing corrective action.",
    keyFunctions: [
      "Quality planning — inspection plans, master inspection characteristics, sampling",
      "Inspection lot creation at goods receipt, in-process and pre-delivery points",
      "Results recording, defect recording and usage decision",
      "Quality certificates for incoming material and outgoing delivery",
      "Vendor quality evaluation and approved supplier control",
      "Quality notifications for customer, internal and vendor issues",
      "Corrective and preventive action (CAPA) tracking through to closure",
      "Batch and serial traceability for recall management",
    ],
    benefits: [
      "Fewer defective materials entering production",
      "Documented compliance evidence for regulated industries and customer audits",
      "Faster recall response through complete batch-level traceability",
      "Measurable supplier quality performance supporting sourcing decisions",
    ],
    audience:
      "QA/QC professionals, regulatory compliance specialists, laboratory managers, and consultants serving pharmaceutical, food, automotive, aerospace or medical device clients.",
  },
  {
    slug: "pm-plant-maintenance",
    familySlug: "core-erp",
    code: "PM",
    name: "Plant Maintenance",
    icon: "Wrench",
    overview:
      "SAP PM, also delivered as Enterprise Asset Management, manages the maintenance of physical assets across their working life — a structured register of technical objects, preventive maintenance planning, breakdown response, and the labour, materials and cost consumed by every maintenance activity.",
    keyFunctions: [
      "Technical object structure — functional locations, equipment, BOMs",
      "Preventive maintenance planning by time, counter reading or condition",
      "Maintenance task lists and standard job specifications",
      "Maintenance notification for breakdown reporting",
      "Maintenance order processing — planning, scheduling, execution, confirmation",
      "Spare parts planning and reservation integrated with Materials Management",
      "Shutdown and turnaround planning for large-scale outages",
      "Mobile maintenance execution through Fiori applications",
    ],
    benefits: [
      "Increased equipment availability through planned intervention",
      "Lower total maintenance cost by reducing emergency work and overtime",
      "Extended asset life through documented, consistent servicing",
      "Evidence of safety and regulatory compliance for inspected equipment",
    ],
    audience:
      "Maintenance planners and engineers, reliability specialists, plant and facilities managers, and consultants serving manufacturing, energy, utilities, mining and transport.",
  },
  {
    slug: "hcm-human-capital-management",
    familySlug: "core-erp",
    code: "HCM",
    name: "Human Capital Management",
    icon: "Users2",
    overview:
      "SAP HCM manages the employee record and the administrative processes around it — organizational structure and personnel administration through time recording to payroll. Many landscapes now complement or replace it with SAP SuccessFactors, but a very large number of organizations still run payroll on HCM.",
    keyFunctions: [
      "Organisational Management — structure of units, positions, jobs, reporting lines",
      "Personnel Administration — the complete employee record through hire, change, exit",
      "Time Management — schedules, attendance, absence, quotas, overtime valuation",
      "Payroll processing with country-specific statutory calculation and reporting",
      "Benefits administration and enrolment",
      "Personnel Development — qualifications, appraisals, development plans",
      "Recruitment and applicant tracking",
      "Employee and Manager Self-Service for routine transactions",
    ],
    benefits: [
      "Accurate, on-time payroll with statutory compliance in every operating country",
      "A single reliable source of workforce data for planning and reporting",
      "Reduced administrative load through self-service for routine requests",
      "Auditable records of every change to employment terms",
    ],
    audience:
      "Human resources professionals, payroll administrators, time & attendance specialists, and consultants supporting organizations that retain SAP payroll alongside cloud HR elsewhere.",
  },

  // ---- SAP S/4HANA Lines of Business ----
  {
    slug: "s4-finance",
    familySlug: "s4hana-lines-of-business",
    code: "S/4 Finance",
    name: "S/4HANA Finance",
    icon: "LineChart",
    overview:
      "SAP S/4HANA Finance unifies financial accounting and management accounting into a single Universal Journal table, eliminating the reconciliation effort that separated the two in earlier releases. Financial and managerial views of the same transaction come from one record, so reporting is immediate and consistent at line-item level.",
    keyFunctions: [
      "Universal Journal combining GL, controlling, asset accounting and margin analysis",
      "Central Finance for consolidating data from multiple source systems",
      "Advanced Financial Closing with task orchestration and dependency management",
      "Cash Management and Liquidity Forecasting with real-time visibility",
      "Treasury and Risk Management — instruments, hedging, exposure, valuation",
      "Receivables, dispute, collections and credit management",
      "Group Reporting for statutory and management consolidation in one system",
      "Embedded analytics and Fiori analytical apps with drill-down to source document",
    ],
    benefits: [
      "A significantly shorter financial close — no ledger reconciliation required",
      "Real-time margin and profitability analysis, not period-end reporting",
      "A single version of financial truth across every legal entity and standard",
      "Forward-looking cash visibility supporting active liquidity management",
    ],
    audience:
      "Existing SAP FI/CO consultants converting their skills to the current release, finance transformation leads, CFO office analysts, and new consultants who want to learn finance on the current platform.",
  },
  {
    slug: "s4-sourcing-procurement",
    familySlug: "s4hana-lines-of-business",
    code: "S/4 Procurement",
    name: "S/4HANA Sourcing & Procurement",
    icon: "PackageCheck",
    overview:
      "SAP S/4HANA Sourcing and Procurement modernizes the traditional MM procurement scope with guided buying, embedded spend analytics, automated invoice processing and native connectivity to the SAP Ariba supplier network — moving buyers from transaction processing to exception handling and supplier strategy.",
    keyFunctions: [
      "Operational purchasing — requisition, purchase order, confirmation, goods receipt",
      "Self-service requisitioning with guided buying and catalogue selection",
      "Central procurement across multiple connected back-end systems",
      "Sourcing and contract management with compliance monitoring",
      "Supplier management — evaluation, classification, qualification, risk",
      "Invoice collaboration and automated three-way matching with exception routing",
      "Spend visibility and category analysis as embedded analytics",
      "Integration with SAP Ariba, SAP Business Network and SAP Fieldglass",
    ],
    benefits: [
      "Higher contract compliance — buying guided toward approved sources",
      "Lower processing cost per purchase order through automation",
      "Faster response to supply disruption via proactive alerts",
      "Improved negotiating position from complete, current spend visibility",
    ],
    audience:
      "SAP MM consultants updating their skills, procurement and category managers, supply chain analysts, and consultants working on procurement transformation programmes.",
  },
  {
    slug: "s4-manufacturing",
    familySlug: "s4hana-lines-of-business",
    code: "S/4 Manufacturing",
    name: "S/4HANA Manufacturing",
    icon: "Cpu",
    overview:
      "SAP S/4HANA Manufacturing extends traditional Production Planning with advanced planning and scheduling, production engineering, manufacturing execution integration and quality management — running on the in-memory database, which lets large-scale MRP complete in a fraction of the time previously required.",
    keyFunctions: [
      "Material Requirements Planning Live on the in-memory database",
      "Production planning and detailed scheduling with finite capacity",
      "Demand-driven replenishment using buffer positioning",
      "Discrete, repetitive and process manufacturing execution",
      "Production engineering and operations for complex assembly",
      "Manufacturing execution integration with shop floor and machine data",
      "Quality management embedded across production inspection points",
      "Digital manufacturing insights and production performance analytics",
    ],
    benefits: [
      "Planning cycles measured in minutes, enabling more frequent replanning",
      "Reduced inventory buffers as replenishment responds to real consumption",
      "Faster, better-informed response to shortages and capacity constraints",
      "Improved schedule adherence and reduced changeover loss",
    ],
    audience:
      "SAP PP consultants moving to the current release, production planning managers, manufacturing systems specialists and Industry 4.0 project teams.",
  },
  {
    slug: "s4-supply-chain",
    familySlug: "s4hana-lines-of-business",
    code: "S/4 Supply Chain",
    name: "S/4HANA Supply Chain",
    icon: "Boxes",
    overview:
      "SAP S/4HANA Supply Chain covers inventory, warehousing, transportation and order fulfilment as an integrated whole — bringing extended warehouse management and transportation management into the digital core, so stock, storage bins, shipments and freight costs are managed in one system.",
    keyFunctions: [
      "Inventory management with real-time stock visibility across plants and locations",
      "Extended Warehouse Management — putaway, removal, wave and labour management",
      "Yard management, cross-docking and value-added services",
      "Transportation Management — freight planning, carrier selection, settlement",
      "Advanced Available-to-Promise with backorder processing",
      "Order fulfilment monitoring across the delivery lifecycle",
      "Returns management for customer, supplier and in-house repair scenarios",
      "Supply chain analytics — fill rate, on-time delivery, inventory turns",
    ],
    benefits: [
      "Higher order fill rates through intelligent allocation of constrained stock",
      "Lower freight cost through consolidated planning and carrier tendering",
      "Reduced warehouse labour cost through optimised task sequencing",
      "A single inventory view eliminating duplicated safety stock",
    ],
    audience:
      "Supply chain planners, warehouse and distribution managers, logistics coordinators, and consultants specialising in extended warehouse or transportation management.",
  },
  {
    slug: "s4-sales",
    familySlug: "s4hana-lines-of-business",
    code: "S/4 Sales",
    name: "S/4HANA Sales",
    icon: "TrendingUp",
    overview:
      "SAP S/4HANA Sales delivers the order-to-cash process with a simplified data model, embedded real-time analytics and a Fiori-based user experience — sales professionals see order status, credit position, delivery progress and margin on the same screen rather than running separate reports.",
    keyFunctions: [
      "Sales master data — business partners, sales areas, condition records",
      "Enquiry, quotation and sales order processing, including complex contracts",
      "Condition contract management for rebates, commissions and settlement",
      "Advanced Available-to-Promise with product allocation",
      "Credit management integrated with financial supply chain management",
      "Billing, convergent invoicing and revenue accounting",
      "Claims, returns and refund management",
      "Situation handling for blocked orders, credit holds and delivery delays",
    ],
    benefits: [
      "Faster order processing with fewer manual interventions",
      "Real-time margin visibility at the point of quotation",
      "Improved customer experience through accurate delivery commitments",
      "Compliant revenue recognition supported by the system, not spreadsheets",
    ],
    audience:
      "SAP SD consultants converting to the current release, sales operations managers, customer service leads and revenue accounting professionals.",
  },
  {
    slug: "s4-asset-management",
    familySlug: "s4hana-lines-of-business",
    code: "S/4 Asset Mgmt",
    name: "S/4HANA Asset Management",
    icon: "Settings2",
    overview:
      "SAP S/4HANA Asset Management extends traditional plant maintenance with condition-based and predictive maintenance, mobile execution and asset performance analytics — maintenance shifts from a fixed calendar schedule toward intervention driven by the actual condition and criticality of the asset.",
    keyFunctions: [
      "Asset structure — functional locations, equipment, measuring points, counters",
      "Preventive, corrective, condition-based and predictive maintenance strategies",
      "Maintenance planning and scheduling with resource levelling",
      "Mobile maintenance execution through Fiori for field technicians",
      "Asset Central Foundation — a shared asset master across cloud and on-premise",
      "Asset Performance Management — reliability-centred maintenance, failure analysis",
      "Spare parts optimisation and refurbishment processing",
      "Maintenance cost, reliability and availability analytics",
    ],
    benefits: [
      "Reduced unplanned downtime through early detection of failure conditions",
      "Lower maintenance spend by avoiding unnecessary calendar-based work",
      "Higher technician productivity through mobile access to orders and history",
      "Better capital planning based on documented asset condition",
    ],
    audience:
      "SAP PM consultants updating their skills, reliability engineers, maintenance managers, and consultants serving utilities, energy, transport, mining and process manufacturing.",
  },

  // ---- SAP Cloud Solutions ----
  {
    slug: "successfactors",
    familySlug: "cloud-solutions",
    code: "SF",
    name: "SuccessFactors",
    icon: "Users",
    overview:
      "SAP SuccessFactors is the SAP human experience management suite covering the complete employee lifecycle in the cloud — from workforce planning and recruitment through onboarding, performance, learning, compensation and succession. It's the strategic direction for HR within the SAP portfolio, deployed standalone or alongside SAP HCM payroll.",
    keyFunctions: [
      "Employee Central — the core HR record, org structure and position management",
      "Employee Central Payroll built on proven SAP payroll calculation",
      "Recruiting — requisition, posting, candidate management, offer",
      "Onboarding and offboarding with structured task orchestration",
      "Performance and Goals — objective setting, continuous feedback, calibration",
      "Compensation and Variable Pay — planning, budgeting, modelling",
      "Succession and Development — talent pools, nine-box, development planning",
      "Learning — course catalogue, compliance training, certification tracking",
    ],
    benefits: [
      "A single global HR record spanning every country and entity",
      "Shorter time-to-hire through streamlined recruiting and onboarding",
      "Documented, defensible performance and compensation decisions",
      "Workforce insight that supports planning, not only reporting on the past",
    ],
    audience:
      "HR business partners, talent acquisition and learning professionals, HRIS analysts, and consultants building a cloud HR practice. Module-specific certifications are frequently a client requirement.",
  },
  {
    slug: "ariba",
    familySlug: "cloud-solutions",
    code: "Ariba",
    name: "Ariba",
    icon: "Handshake",
    overview:
      "SAP Ariba is the SAP cloud procurement and supplier collaboration suite, operating over the SAP Business Network. It covers strategic sourcing, contract lifecycle management, operational buying, invoicing and supplier risk — connecting buyers and suppliers on a shared network rather than point-to-point interfaces.",
    keyFunctions: [
      "Sourcing — RFI, RFP, reverse auction and award scenario analysis",
      "Contract lifecycle management with clause libraries and expiry monitoring",
      "Guided buying with catalogue, punchout and non-catalogue requests",
      "Purchase order transmission and confirmation over the Business Network",
      "Invoice management with automated matching and exception handling",
      "Supplier lifecycle and performance management",
      "Supplier risk monitoring drawing on external risk data sources",
      "Spend analysis with category classification and savings tracking",
    ],
    benefits: [
      "Measurable sourcing savings through competitive events",
      "Reduced maverick spend — approved catalogues are the easiest path to buy",
      "Faster invoice cycle times and improved supplier relationships",
      "Early warning of supplier financial, geographic and compliance risk",
    ],
    audience:
      "Procurement and sourcing professionals, contract managers, accounts payable leads, supplier relationship managers, and consultants delivering source-to-pay transformation.",
  },
  {
    slug: "concur",
    familySlug: "cloud-solutions",
    code: "Concur",
    name: "Concur",
    icon: "Plane",
    overview:
      "SAP Concur manages travel, expense and supplier invoice processes in the cloud — capturing spend at the point it occurs, applying policy automatically, and routing exceptions for review, replacing manual expense claims with a mobile, largely automated process.",
    keyFunctions: [
      "Travel booking with policy enforcement at the point of reservation",
      "Expense capture through mobile receipt photography and OCR",
      "Corporate card feed integration and automatic transaction matching",
      "Mileage capture, per-diem calculation and multi-currency handling",
      "Policy engine flagging out-of-policy and duplicate claims automatically",
      "Approval workflow with delegation and escalation",
      "Supplier invoice capture, coding and approval",
      "Spend analytics by department, category, supplier and traveller",
    ],
    benefits: [
      "Lower travel and expense cost through visible, enforced policy",
      "Faster employee reimbursement and fewer disputed claims",
      "Reduced finance team effort spent on manual claim checking",
      "Improved duty of care — traveller location known during disruption",
    ],
    audience:
      "Finance operations and shared-service professionals, travel programme managers, accounts payable specialists, and consultants implementing travel & expense automation.",
  },
  {
    slug: "business-technology-platform",
    familySlug: "cloud-solutions",
    code: "BTP",
    name: "Business Technology Platform",
    icon: "Cloud",
    overview:
      "SAP Business Technology Platform (SAP BTP) is where SAP applications are extended, integrated, automated and enriched with data and AI — where custom development now belongs, keeping the digital core clean and upgradeable while still letting organizations build exactly what they need.",
    keyFunctions: [
      "Application development through SAP Build — low-code and professional code",
      "SAP Build Process Automation for workflow and robotic process automation",
      "SAP Integration Suite connecting SAP and non-SAP systems",
      "Data and analytics services including SAP Datasphere",
      "AI services including SAP AI Core and the Joule assistant",
      "Side-by-side extensibility keeping custom logic outside the core system",
      "Identity and access management, including customer IAM",
      "Multi-cloud deployment across major hyperscale providers",
    ],
    benefits: [
      "A clean core that upgrades without regression-testing years of custom mods",
      "Faster delivery of new capability through reusable services and low-code tooling",
      "Consistent integration patterns rather than point-to-point interface sprawl",
      "A controlled route to adopt AI within business processes",
    ],
    audience:
      "ABAP and full-stack developers, integration architects, solution architects, data engineers, and functional consultants who want to extend applications without modifying the core.",
  },
  {
    slug: "analytics-cloud",
    familySlug: "cloud-solutions",
    code: "SAC",
    name: "Analytics Cloud",
    icon: "BarChart3",
    overview:
      "SAP Analytics Cloud brings business intelligence, planning and predictive analytics together in a single cloud application — rather than reporting in one tool and planning in another, users analyse a result, model an alternative and commit a plan without leaving the same environment.",
    keyFunctions: [
      "Story building with interactive charts, tables, maps and responsive layouts",
      "Live and imported connections to SAP S/4HANA, Datasphere, BW and third parties",
      "Enterprise planning — financial, workforce, sales and operational plans",
      "Driver-based modelling, allocation, version management and what-if simulation",
      "Predictive scenarios — forecasting, classification, time series analysis",
      "Smart insights and natural language query for business users",
      "Analytics Designer for building tailored analytical applications",
      "Governed data access and row-level security",
    ],
    benefits: [
      "One environment for reporting and planning — no spreadsheet reconciliation",
      "Faster planning cycles through driver-based models and rapid scenarios",
      "Wider analytics adoption as business users build their own stories",
      "Decisions supported by current data, not a monthly extract",
    ],
    audience:
      "Business analysts, FP&A professionals, reporting specialists, data visualisation designers, and consultants delivering planning and analytics projects.",
  },
  {
    slug: "integrated-business-planning",
    familySlug: "cloud-solutions",
    code: "IBP",
    name: "Integrated Business Planning",
    icon: "Compass",
    overview:
      "SAP Integrated Business Planning (SAP IBP) is the SAP cloud solution for supply chain planning — demand forecasting, inventory optimisation, supply and response planning and sales & operations planning — providing a control-tower view of the end-to-end supply chain.",
    keyFunctions: [
      "Demand planning with statistical forecasting and demand sensing",
      "Sales and Operations Planning aligning commercial, supply and financial plans",
      "Inventory optimisation calculating multi-echelon safety stock targets",
      "Supply planning — constrained and unconstrained scenarios",
      "Response and supply planning for short-term allocation",
      "Supply Chain Control Tower with end-to-end visibility and alerts",
      "Scenario planning and simulation for disruption response",
      "Microsoft Excel-based planning interface alongside a browser interface",
    ],
    benefits: [
      "Improved forecast accuracy with a corresponding reduction in safety stock",
      "A single aligned plan across sales, operations and finance",
      "Faster, better-informed response to demand shifts and supply disruption",
      "Better service levels achieved with less working capital in inventory",
    ],
    audience:
      "Demand and supply planners, S&OP process owners, inventory analysts, supply chain managers, and consultants delivering supply chain planning transformation.",
  },

  // ---- SAP Technical Modules ----
  {
    slug: "abap",
    familySlug: "technical-modules",
    code: "ABAP",
    name: "ABAP",
    icon: "Code2",
    overview:
      "ABAP is the programming language in which SAP applications are written and in which most customer-specific developments are built. Modern ABAP emphasises the RESTful application programming model, core data services, object-oriented design and a clean-core approach where extensions use released interfaces rather than modifying standard objects.",
    keyFunctions: [
      "Core language — data types, internal tables, control structures, modularisation",
      "Object-oriented ABAP — classes, interfaces, inheritance, exception handling",
      "Core Data Services views for reusable data models with embedded analytics",
      "RESTful Application Programming model for building Fiori-ready services",
      "Open SQL and code-to-data pushing logic to the database layer",
      "Enhancement framework, business add-ins and released extension points",
      "Data dictionary objects — tables, views, structures, domains, search helps",
      "Custom code migration and remediation for SAP S/4HANA conversion",
    ],
    benefits: [
      "Business capability no standard application delivers, built to fit the process",
      "A clean core that upgrades cleanly via released interfaces",
      "Substantially better performance when logic runs at the database layer",
      "Reduced technical debt through disciplined standards and code inspection",
    ],
    audience:
      "Software developers, computer science and engineering graduates, technical consultants, and functional consultants who want to read and specify developments credibly.",
  },
  {
    slug: "basis",
    familySlug: "technical-modules",
    code: "BASIS",
    name: "BASIS & System Administration",
    icon: "Server",
    overview:
      "SAP BASIS is the technical administration layer that keeps the SAP landscape running — installation, configuration, monitoring, performance tuning, transport management, upgrades, backup, recovery and the operation of the SAP HANA database. Nothing in an SAP landscape works without it.",
    keyFunctions: [
      "Installation and system copy across development, QA and production",
      "Client administration, client copy and client transport",
      "Transport management system configuration and change control",
      "User administration, role assignment and licence measurement",
      "Performance monitoring, workload analysis and memory/buffer tuning",
      "Database administration for SAP HANA — backup, recovery, replication",
      "SAP S/4HANA conversion technical execution via Software Update Manager",
      "High availability, disaster recovery design and failover testing",
    ],
    benefits: [
      "High system availability and predictable performance under load",
      "Controlled change through a disciplined transport and release process",
      "Confidence that recovery from a failure is tested, not assumed",
      "Lower infrastructure cost through right-sizing and capacity planning",
    ],
    audience:
      "System administrators, infrastructure engineers, database administrators, cloud operations engineers, and IT graduates seeking a technical route into SAP without functional business knowledge.",
  },
  {
    slug: "fiori-sapui5",
    familySlug: "technical-modules",
    code: "Fiori/UI5",
    name: "Fiori & SAPUI5",
    icon: "MonitorSmartphone",
    overview:
      "SAP Fiori is the design system and user experience for modern SAP applications, and SAPUI5 is the JavaScript framework in which Fiori applications are built. Together they replace transaction-driven screens with role-based, task-focused, device-responsive applications.",
    keyFunctions: [
      "Fiori design principles — role-based, adaptive, coherent, simple, delightful",
      "Fiori launchpad configuration — catalogues, groups, spaces, pages",
      "Standard Fiori application activation and the apps reference library",
      "SAPUI5 development — views, controllers, models and data binding",
      "Model-View-Controller architecture and routing",
      "OData service consumption and creation",
      "Fiori Elements for building applications from annotations",
      "Extension and adaptation of standard applications without modification",
    ],
    benefits: [
      "Higher user adoption — tasks presented the way people actually work",
      "Reduced training effort for occasional and casual users",
      "Mobile execution of processes that previously required a desktop",
      "Fewer errors through guided, validated, simplified task flows",
    ],
    audience:
      "Front-end and JavaScript developers, ABAP developers extending into UX, enterprise UX designers, and consultants responsible for user adoption on transformation programmes.",
  },
  {
    slug: "integration-suite",
    familySlug: "technical-modules",
    code: "Integration",
    name: "Integration Suite",
    icon: "GitMerge",
    overview:
      "SAP Integration Suite is the SAP integration platform as a service and successor to SAP Process Integration/Orchestration — connecting SAP applications to each other, to cloud services and to third-party systems, using prebuilt integration content, managed APIs and event-driven patterns.",
    keyFunctions: [
      "Cloud Integration for designing, deploying and monitoring integration flows",
      "Prebuilt integration content for common SAP-to-SAP and third-party scenarios",
      "API Management — publishing, securing, throttling, monitoring APIs",
      "Open Connectors to a large catalogue of non-SAP applications",
      "Event Mesh for publish/subscribe event-driven architecture",
      "Integration Advisor with machine-assisted mapping proposals",
      "Message monitoring, alerting and error resolution",
      "Cloud connector for secure hybrid connectivity to on-premise systems",
    ],
    benefits: [
      "Faster integration delivery through reusable prebuilt content",
      "A single monitoring point for integration failures across the landscape",
      "Governed, secure exposure of business services to partners and teams",
      "Reduced maintenance versus a web of point-to-point interfaces",
    ],
    audience:
      "Integration developers and architects, middleware specialists, API engineers, and consultants supporting hybrid landscapes where cloud and on-premise must operate as one.",
  },
  {
    slug: "security-grc",
    familySlug: "technical-modules",
    code: "Security/GRC",
    name: "Security & GRC",
    icon: "ShieldCheck",
    overview:
      "SAP Security controls who can do what in the system, and SAP Governance, Risk and Compliance provides the framework that proves those controls work. Together they protect business data, enforce segregation of duties, satisfy auditors and manage the risk that privileged access creates.",
    keyFunctions: [
      "Authorisation concept design — roles, profiles, authorisation objects",
      "Role design — single, composite and derived roles across the org structure",
      "User lifecycle administration — provisioning, change, revocation",
      "Segregation-of-duties analysis, conflict identification, mitigating controls",
      "Access Control — automated access request, risk analysis, approval workflow",
      "Emergency access management for controlled, logged privileged access",
      "Process Control for automated control testing and evidence collection",
      "Security auditing, system logging and read-access logging for sensitive data",
    ],
    benefits: [
      "Clean audit outcomes with documented evidence, not reconstructed explanations",
      "Reduced fraud exposure through enforced segregation of incompatible duties",
      "Faster, better-controlled access provisioning for new joiners and movers",
      "Demonstrable compliance with data protection obligations",
    ],
    audience:
      "Security administrators, internal auditors, compliance officers, risk professionals, and consultants working with regulated organizations or statutory internal control reporting.",
  },
];

export function getModuleFamily(slug) {
  return moduleFamilies.find((f) => f.slug === slug);
}

export function getModulesForFamily(familySlug) {
  return sapModules.filter((m) => m.familySlug === familySlug);
}

export function getModule(slug) {
  return sapModules.find((m) => m.slug === slug);
}

export function getRelatedModules(module, count = 3) {
  return sapModules.filter((m) => m.familySlug === module.familySlug && m.slug !== module.slug).slice(0, count);
}

export function searchModules(query) {
  const q = query.trim().toLowerCase();
  if (!q) return sapModules;
  return sapModules.filter(
    (m) =>
      m.name.toLowerCase().includes(q) ||
      m.code.toLowerCase().includes(q) ||
      m.overview.toLowerCase().includes(q)
  );
}

// ---------------------------------------------------------------------------
// Industries
// ---------------------------------------------------------------------------

export const sapIndustries = [
  { id: "manufacturing", icon: "Factory", name: "Manufacturing and Industrial", description: "Discrete and process manufacturing, production planning, shop floor integration, quality management, plant maintenance and product costing." },
  { id: "retail", icon: "ShoppingBag", name: "Retail and Consumer Products", description: "Merchandising, assortment planning, promotion management, multi-channel order fulfilment, store replenishment and trade promotion settlement." },
  { id: "pharma", icon: "FlaskConical", name: "Pharmaceuticals and Life Sciences", description: "Batch traceability, validated environments, stability studies, serialisation, regulated documentation and audit readiness." },
  { id: "automotive", icon: "Car", name: "Automotive and Component Supply", description: "Scheduling agreements, just-in-time and just-in-sequence supply, EDI with OEMs, and variant configuration." },
  { id: "energy", icon: "Fuel", name: "Energy, Utilities and Resources", description: "Asset-intensive maintenance, work management, plant shutdown planning, meter-to-cash processes and regulatory reporting." },
  { id: "logistics", icon: "Truck", name: "Logistics and Transportation", description: "Warehouse operations, freight planning and settlement, carrier collaboration and end-to-end shipment visibility." },
  { id: "professional-services", icon: "Briefcase", name: "Professional Services", description: "Project-based resourcing, time and expense capture, project accounting, revenue recognition and utilisation reporting." },
  { id: "public-sector", icon: "School", name: "Public Sector and Education", description: "Fund and grant management, budgetary control, procurement compliance and statutory reporting." },
];

// ---------------------------------------------------------------------------
// FAQs
// ---------------------------------------------------------------------------

export const sapFaqs = [
  {
    q: "Which SAP module should I learn first?",
    a: "It depends on your background rather than on market demand alone. Finance and commerce backgrounds usually start with SAP FI or FICO. Engineering and manufacturing backgrounds suit SAP PP, MM or PM. Sales and customer service backgrounds suit SAP SD. Computer science backgrounds suit ABAP, BASIS or Fiori. We run a short assessment conversation before enrolment and recommend a path honestly.",
  },
  {
    q: "Do I need work experience before learning SAP?",
    a: "Not strictly, but domain experience makes a very large difference to how quickly you become employable. A consultant who understands why a business runs a month-end close learns SAP FI far faster than someone learning both at once.",
  },
  {
    q: "Should I learn SAP ECC or SAP S/4HANA?",
    a: "Learn SAP S/4HANA. It's the current platform and the direction of every SAP roadmap. That said, many organizations still run SAP ECC, so understanding the differences remains valuable. Our courses teach the current release and explain what changed and why.",
  },
  {
    q: "Is SAP certification necessary to get a job?",
    a: "It's not always mandatory, but it's frequently used as a filter in shortlisting, particularly for consulting firms. Certification demonstrates baseline knowledge — it does not substitute for project experience, and we say so plainly to learners.",
  },
  {
    q: "How long does an SAP implementation take?",
    a: "There's no honest single answer. A focused single-module deployment in a mid-sized organization may take a few months; a multi-country, multi-entity SAP S/4HANA programme may run across several years. Duration is driven by scope, legal entities, data quality, integration count, custom code volume and SME availability. We provide an indicative range after a discovery assessment.",
  },
  {
    q: "What is the difference between a greenfield and a brownfield approach?",
    a: "A greenfield approach builds a new system and designs processes fresh, discarding legacy configuration and custom code. A brownfield approach converts the existing system in place, preserving configuration, history and developments. A selective data transition sits between the two.",
  },
  {
    q: "Can you support a system that someone else implemented?",
    a: "Yes. Most of our support engagements involve landscapes built by another party. We run a structured transition covering system discovery, custom code and interface inventory, shadowing of the incumbent team, and a documented handover before we take full ownership.",
  },
  {
    q: "Do you offer training on our own system rather than a generic one?",
    a: "Yes, and for go-live readiness we recommend it. Corporate batch training can be delivered on your own QA or training client using your configuration, master data and process variants, which removes the gap between what users learn and what they subsequently see.",
  },
  {
    q: "What does support cost?",
    a: "Support pricing depends on landscape size, module scope, coverage hours, expected ticket volume and service level targets. We size an engagement after a short discovery and quote a monthly fee, rather than a rate before knowing what we'd be supporting.",
  },
  {
    q: "Do you provide remote delivery?",
    a: "Yes. Training, implementation and support are all delivered remotely as standard, with on-site presence at agreed points such as blueprint workshops, user acceptance testing and go-live cutover.",
  },
];

// ---------------------------------------------------------------------------
// Contact / enquiry presets
// ---------------------------------------------------------------------------

export const sapEnquiryInterests = [
  { value: "training", label: "SAP Training — a course or certification path" },
  { value: "implementation", label: "SAP Implementation — new build, conversion or rollout" },
  { value: "support", label: "SAP Support — application management / AMS" },
  { value: "career-guidance", label: "Free career guidance call (individuals)" },
  { value: "other", label: "Something else" },
];

export const sapCtaBlocks = [
  {
    id: "individuals",
    icon: "GraduationCap",
    title: "For individuals",
    description: "Book a free career guidance call. We'll review your background, recommend a module path and share a realistic timeline to becoming employable.",
    ctaLabel: "Book a guidance call",
    to: "/sap/contact",
    preset: "training",
  },
  {
    id: "projects",
    icon: "Workflow",
    title: "For organizations planning a project",
    description: "Request a discovery assessment. We'll review your current landscape and process scope and return an indicative timeline, effort and cost model.",
    ctaLabel: "Request a discovery assessment",
    to: "/sap/contact",
    preset: "implementation",
  },
  {
    id: "support-seekers",
    icon: "LifeBuoy",
    title: "For organizations needing support",
    description: "Request a support proposal. Share your landscape details and coverage requirements and we'll size an engagement and propose service levels.",
    ctaLabel: "Request a support proposal",
    to: "/sap/contact",
    preset: "support",
  },
];
