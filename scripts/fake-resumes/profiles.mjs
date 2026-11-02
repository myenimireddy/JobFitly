/**
 * Fictional demo personas for JobFitly testing / LinkedIn videos.
 * Not real people. Emails use @jobfitly.test.
 * Phones are masked (000) 000-00NN — never use real-looking numbers.
 *
 * Names align with backend/scripts/seed-role-profiles.js where possible.
 */

/** @typedef {{
 *   key: string,
 *   firstName: string,
 *   lastName: string,
 *   email: string,
 *   phone: string,
 *   city: string,
 *   state: string,
 *   title: string,
 *   company: string,
 *   summary: string,
 *   skills: string[],
 *   experience: Array<{ title: string, company: string, dates: string, bullets: string[] }>,
 *   education: { degree: string, school: string, dates: string, note?: string },
 *   extras?: string[],
 * }} FakeProfile */

/** @type {FakeProfile[]} */
export const PROFILES = [
  {
    key: 'business',
    firstName: 'Priya',
    lastName: 'Sharma',
    email: 'priya.sharma@jobfitly.test',
    phone: '(000) 000-0001',
    city: 'Austin',
    state: 'TX',
    title: 'Business Analyst',
    company: 'Accenture',
    summary:
      'Business analyst with 5+ years translating stakeholder needs into clear requirements. Strong in SQL, workshops, and shipping measurable process improvements.',
    skills: ['SQL', 'Excel', 'Jira', 'Requirements', 'Stakeholder management', 'Process mapping'],
    experience: [
      {
        title: 'Business Analyst',
        company: 'Accenture',
        dates: 'Mar 2021 - Present | Austin, TX',
        bullets: [
          'Led discovery for 8 client workflows; cut handoff defects about 25%.',
          'Built SQL dashboards for ops leaders tracking SLA and backlog.',
          'Partnered with engineering to refine acceptance criteria in Jira.',
        ],
      },
      {
        title: 'Associate Analyst',
        company: 'Deloitte',
        dates: 'Jul 2018 - Feb 2021 | Dallas, TX',
        bullets: [
          'Documented as-is / to-be processes for retail and healthcare clients.',
          'Facilitated workshops with cross-functional stakeholders.',
        ],
      },
    ],
    education: {
      degree: 'BBA, Business Administration',
      school: 'University of Texas at Austin',
      dates: '2014 - 2018',
    },
    extras: ['Work authorization: U.S. (demo)', 'Open to: hybrid Austin or remote BA roles'],
  },
  {
    key: 'fullstack',
    firstName: 'Alex',
    lastName: 'Chen',
    email: 'alex.chen@jobfitly.test',
    phone: '(000) 000-0002',
    city: 'San Francisco',
    state: 'CA',
    title: 'Full Stack Engineer',
    company: 'Stripe',
    summary:
      'Full-stack engineer focused on TypeScript, React, and Node. Ships reliable APIs and polished product UI with strong testing habits.',
    skills: ['TypeScript', 'React', 'Node.js', 'PostgreSQL', 'AWS', 'Jest'],
    experience: [
      {
        title: 'Full Stack Engineer',
        company: 'Stripe',
        dates: 'Jan 2022 - Present | San Francisco, CA',
        bullets: [
          'Owned merchant dashboard features end-to-end in React and Node.',
          'Designed Postgres-backed APIs with clear versioning and observability.',
          'Raised Jest coverage on critical billing paths above 80%.',
        ],
      },
      {
        title: 'Software Engineer',
        company: 'Dropbox',
        dates: 'Jun 2019 - Dec 2021 | Remote',
        bullets: [
          'Built internal tools for content ops using React and Express.',
          'Migrated legacy JS modules to TypeScript with incremental adoption.',
        ],
      },
    ],
    education: {
      degree: 'B.S. Computer Science',
      school: 'Stanford University',
      dates: '2015 - 2019',
    },
    extras: ['Work authorization: U.S. (demo)', 'Open to: Bay Area hybrid or remote'],
  },
  {
    key: 'devops',
    firstName: 'Jordan',
    lastName: 'Nguyen',
    email: 'jordan.nguyen@jobfitly.test',
    phone: '(000) 000-0003',
    city: 'Seattle',
    state: 'WA',
    title: 'DevOps Engineer',
    company: 'HashiCorp',
    summary:
      'DevOps engineer specializing in Kubernetes, Terraform, and CI/CD. Improves deploy reliability and platform observability.',
    skills: ['Kubernetes', 'Terraform', 'CI/CD', 'AWS', 'Prometheus', 'GitHub Actions'],
    experience: [
      {
        title: 'DevOps Engineer',
        company: 'HashiCorp',
        dates: 'Feb 2022 - Present | Seattle, WA',
        bullets: [
          'Standardized Terraform modules used by 12 product teams.',
          'Cut mean time to recover with better Prometheus alerts and runbooks.',
          'Hardened GitHub Actions pipelines with reusable workflows.',
        ],
      },
      {
        title: 'SRE',
        company: 'Expedia',
        dates: 'Aug 2019 - Jan 2022 | Seattle, WA',
        bullets: [
          'Operated multi-region Kubernetes clusters for booking services.',
          'Automated blue/green deploys reducing failed releases.',
        ],
      },
    ],
    education: {
      degree: 'B.S. Computer Engineering',
      school: 'University of Washington',
      dates: '2015 - 2019',
    },
    extras: ['Work authorization: U.S. (demo)', 'Open to: Seattle hybrid'],
  },
  {
    key: 'frontend',
    firstName: 'Sam',
    lastName: 'Okoye',
    email: 'sam.okoye@jobfitly.test',
    phone: '(000) 000-0004',
    city: 'New York',
    state: 'NY',
    title: 'Frontend Engineer',
    company: 'Figma',
    summary:
      'Frontend engineer obsessed with accessible, fast UI. Deep React/TypeScript experience and design-system collaboration.',
    skills: ['React', 'TypeScript', 'CSS', 'Accessibility', 'Vite', 'Storybook'],
    experience: [
      {
        title: 'Frontend Engineer',
        company: 'Figma',
        dates: 'May 2021 - Present | New York, NY',
        bullets: [
          'Shipped editor chrome improvements with focus on keyboard and screen readers.',
          'Built Storybook coverage for shared components used across products.',
          'Partnered with design to tighten spacing and motion tokens.',
        ],
      },
      {
        title: 'UI Engineer',
        company: 'Etsy',
        dates: 'Jul 2018 - Apr 2021 | Brooklyn, NY',
        bullets: [
          'Owned seller settings UI; improved Core Web Vitals on key pages.',
          'Introduced Vite for faster local frontend builds.',
        ],
      },
    ],
    education: {
      degree: 'B.S. Interactive Media',
      school: 'New York University',
      dates: '2014 - 2018',
    },
    extras: ['Work authorization: U.S. (demo)', 'Open to: NYC hybrid or remote'],
  },
  {
    key: 'backend',
    firstName: 'Diego',
    lastName: 'Martinez',
    email: 'diego.martinez@jobfitly.test',
    phone: '(000) 000-0005',
    city: 'Chicago',
    state: 'IL',
    title: 'Backend Engineer',
    company: 'Uber',
    summary:
      'Backend engineer building high-throughput services in Go. Experience with Kafka, gRPC, and Postgres at scale.',
    skills: ['Go', 'Kafka', 'PostgreSQL', 'gRPC', 'Redis', 'Distributed systems'],
    experience: [
      {
        title: 'Backend Engineer',
        company: 'Uber',
        dates: 'Sep 2021 - Present | Chicago, IL',
        bullets: [
          'Owned gRPC services for trip lifecycle with strict latency budgets.',
          'Tuned Kafka consumer groups to cut lag during peak events.',
          'Introduced Redis caching that reduced DB load on hot paths.',
        ],
      },
      {
        title: 'Software Engineer',
        company: 'Capital One',
        dates: 'Jun 2018 - Aug 2021 | Chicago, IL',
        bullets: [
          'Built payment-adjacent APIs with careful audit logging.',
          'Led on-call rotations and postmortems for backend incidents.',
        ],
      },
    ],
    education: {
      degree: 'M.S. Computer Science',
      school: 'University of Illinois Urbana-Champaign',
      dates: '2016 - 2018',
      note: 'B.S. CS, UIC, 2016',
    },
    extras: ['Work authorization: requires sponsorship (demo)', 'Open to: Chicago or remote'],
  },
  {
    key: 'data',
    firstName: 'Maya',
    lastName: 'Patel',
    email: 'maya.patel@jobfitly.test',
    phone: '(000) 000-0006',
    city: 'Boston',
    state: 'MA',
    title: 'Data Scientist',
    company: 'Databricks',
    summary:
      'Data scientist with strong ML and experimentation chops. Turns messy product data into decisions using Python and Spark.',
    skills: ['Python', 'ML', 'Spark', 'SQL', 'Experimentation', 'pandas'],
    experience: [
      {
        title: 'Data Scientist',
        company: 'Databricks',
        dates: 'Jan 2022 - Present | Boston, MA',
        bullets: [
          'Designed uplift experiments for product growth; shipped models to production notebooks.',
          'Built Spark pipelines cleaning event data for weekly exec reviews.',
          'Partnered with PMs on metric definitions and guardrail KPIs.',
        ],
      },
      {
        title: 'Data Analyst',
        company: 'Wayfair',
        dates: 'Aug 2019 - Dec 2021 | Boston, MA',
        bullets: [
          'Owned SQL marts for marketplace conversion analysis.',
          'Prototyped recommendation features later productionized by ML eng.',
        ],
      },
    ],
    education: {
      degree: 'M.S. Data Science',
      school: 'Massachusetts Institute of Technology',
      dates: '2017 - 2019',
    },
    extras: ['Work authorization: requires sponsorship (demo)', 'Open to: Boston hybrid'],
  },
  {
    key: 'product',
    firstName: 'Chris',
    lastName: 'Baker',
    email: 'chris.baker@jobfitly.test',
    phone: '(000) 000-0007',
    city: 'Denver',
    state: 'CO',
    title: 'Product Manager',
    company: 'Atlassian',
    summary:
      'Product manager for B2B collaboration tools. Balances roadmap clarity, user research, and measurable outcomes.',
    skills: ['Roadmapping', 'User research', 'Metrics', 'A/B testing', 'SQL', 'Jira'],
    experience: [
      {
        title: 'Product Manager',
        company: 'Atlassian',
        dates: 'Apr 2021 - Present | Denver, CO',
        bullets: [
          'Owned a workflow automation surface used by mid-market teams.',
          'Ran research sprints that reframed onboarding and improved activation.',
          'Defined north-star and input metrics; ran A/B tests with data science.',
        ],
      },
      {
        title: 'Associate PM',
        company: 'Twilio',
        dates: 'Jun 2018 - Mar 2021 | Remote',
        bullets: [
          'Shipped developer console improvements based on support ticket themes.',
          'Wrote crisp PRDs and kept eng/design aligned on weekly goals.',
        ],
      },
    ],
    education: {
      degree: 'MBA, Product Management focus',
      school: 'University of Colorado Boulder',
      dates: '2016 - 2018',
    },
    extras: ['Work authorization: U.S. (demo)', 'Open to: Denver hybrid or remote PM'],
  },
  {
    key: 'qa',
    firstName: 'Riley',
    lastName: 'Kim',
    email: 'riley.kim@jobfitly.test',
    phone: '(000) 000-0008',
    city: 'Portland',
    state: 'OR',
    title: 'QA Engineer',
    company: 'Nike',
    summary:
      'QA engineer building resilient Playwright/Cypress suites and practical test strategy for web and API surfaces.',
    skills: ['Playwright', 'Cypress', 'API testing', 'Test strategy', 'CI', 'Jest'],
    experience: [
      {
        title: 'QA Engineer',
        company: 'Nike',
        dates: 'Jun 2021 - Present | Portland, OR',
        bullets: [
          'Owned Playwright regression for checkout; cut flake rate substantially.',
          'Added contract tests for key APIs in CI before release trains.',
          'Coached feature teams on risk-based test planning.',
        ],
      },
      {
        title: 'QA Analyst',
        company: 'New Relic',
        dates: 'Jul 2018 - May 2021 | Portland, OR',
        bullets: [
          'Expanded Cypress coverage for settings and auth flows.',
          'Documented severity guidelines adopted by support and eng.',
        ],
      },
    ],
    education: {
      degree: 'B.S. Software Engineering',
      school: 'Oregon State University',
      dates: '2014 - 2018',
    },
    extras: ['Work authorization: U.S. (demo)', 'Open to: Portland hybrid'],
  },
  {
    key: 'mobile',
    firstName: 'Taylor',
    lastName: 'Brooks',
    email: 'taylor.brooks@jobfitly.test',
    phone: '(000) 000-0009',
    city: 'Atlanta',
    state: 'GA',
    title: 'Mobile Engineer',
    company: 'Snap',
    summary:
      'Mobile engineer shipping iOS and Android features. Comfortable in Swift, Kotlin, and React Native bridges.',
    skills: ['Swift', 'Kotlin', 'React Native', 'iOS', 'Android', 'Mobile CI'],
    experience: [
      {
        title: 'Mobile Engineer',
        company: 'Snap',
        dates: 'Mar 2022 - Present | Atlanta, GA',
        bullets: [
          'Shipped camera-adjacent UX with careful performance budgets.',
          'Shared Kotlin/Swift modules for feature flags across apps.',
          'Improved crash-free sessions via better breadcrumb logging.',
        ],
      },
      {
        title: 'iOS Engineer',
        company: 'The Home Depot',
        dates: 'Jun 2019 - Feb 2022 | Atlanta, GA',
        bullets: [
          'Built store-associate tooling in Swift with offline-friendly sync.',
          'Led App Store release trains with staged rollouts.',
        ],
      },
    ],
    education: {
      degree: 'B.S. Computer Science',
      school: 'Georgia Institute of Technology',
      dates: '2015 - 2019',
    },
    extras: ['Work authorization: U.S. (demo)', 'Open to: Atlanta hybrid or remote'],
  },
  {
    key: 'security',
    firstName: 'Aisha',
    lastName: 'Hassan',
    email: 'aisha.hassan@jobfitly.test',
    phone: '(000) 000-0010',
    city: 'Arlington',
    state: 'VA',
    title: 'Security Engineer',
    company: 'CrowdStrike',
    summary:
      'Security engineer focused on AppSec and threat modeling. Blends code review, automation, and clear guidance for product teams.',
    skills: ['AppSec', 'Threat modeling', 'Python', 'SIEM', 'Penetration testing', 'Secure SDLC'],
    experience: [
      {
        title: 'Security Engineer',
        company: 'CrowdStrike',
        dates: 'Oct 2021 - Present | Arlington, VA',
        bullets: [
          'Ran threat models for new cloud services before major launches.',
          'Built Python scanners catching common secret and dependency issues.',
          'Partnered with eng on remediation SLAs tracked in SIEM dashboards.',
        ],
      },
      {
        title: 'AppSec Analyst',
        company: 'Capital One',
        dates: 'Jul 2018 - Sep 2021 | McLean, VA',
        bullets: [
          'Performed penetration tests on internal web apps.',
          'Wrote secure coding guides adopted in onboarding.',
        ],
      },
    ],
    education: {
      degree: 'M.S. Cybersecurity',
      school: 'George Mason University',
      dates: '2016 - 2018',
    },
    extras: ['Work authorization: U.S. (demo)', 'Open to: DC-area hybrid'],
  },
];
