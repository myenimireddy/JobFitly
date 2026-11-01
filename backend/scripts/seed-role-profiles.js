#!/usr/bin/env node
'use strict';

/**
 * Seed 10 role-based test customers (business, fullstack, devops, …).
 * Live suite runs each profile against ALL portals in `portals`.
 *
 *   npm run seed:role-profiles
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { prisma } = require('../src/lib/prisma');
const profileService = require('../src/modules/profile/service');
const { buildFacts } = require('../src/modules/autofill/logic');

const PORTALS = {
  greenhouse: {
    url: 'https://job-boards.greenhouse.io/reddit/jobs/8194576',
    title: 'Software Engineer — Reddit (Greenhouse)',
  },
  lever: {
    url: 'https://jobs.lever.co/leverdemo/58db3f8e-b108-47d1-9e6e-87a1712497cd/apply',
    title: 'Account Executive — Lever Demo',
  },
  ashby: {
    url: 'https://jobs.ashbyhq.com/ramp/cc0af88a-2a19-493d-93cf-c5090f986f1f/application',
    title: 'Partnerships / GTM — Ramp (Ashby)',
  },
  workday: {
    url: 'https://adobe.wd5.myworkdayjobs.com/en-US/external_experienced/job/San-Jose/Director-of-Engineering--Real-Time-Experience--RTX-_R172776',
    title: 'Director of Engineering — Adobe (Workday)',
  },
};

/** @type {Array<object>} */
const ROLES = [
  {
    key: 'business',
    displayName: 'Role Business User',
    portal: 'lever',
    firstName: 'Priya',
    lastName: 'Sharma',
    email: 'priya.business.role1@jobfitly.test',
    phone: '2145550101',
    city: 'Austin',
    state: 'Texas',
    postal: '78701',
    address1: '100 Congress Ave',
    company: 'Accenture',
    title: 'Business Analyst',
    skills: ['SQL', 'Excel', 'Stakeholder management', 'Requirements', 'Jira'],
    education: { school: 'UT Austin', degree: 'BBA', field: 'Business Administration' },
    gender: 'Female',
    ethnicity: 'South Asian',
    sponsorship: 'No',
    hearAbout: 'LinkedIn',
  },
  {
    key: 'fullstack',
    displayName: 'Role Full Stack User',
    portal: 'greenhouse',
    firstName: 'Alex',
    lastName: 'Chen',
    email: 'alex.fullstack.role2@jobfitly.test',
    phone: '4155550102',
    city: 'San Francisco',
    state: 'California',
    postal: '94105',
    address1: '500 Market St',
    company: 'Stripe',
    title: 'Full Stack Engineer',
    skills: ['TypeScript', 'React', 'Node.js', 'PostgreSQL', 'AWS'],
    education: { school: 'Stanford', degree: 'BS', field: 'Computer Science' },
    gender: 'Male',
    ethnicity: 'East Asian',
    sponsorship: 'No',
    hearAbout: 'Company website',
  },
  {
    key: 'devops',
    displayName: 'Role DevOps User',
    portal: 'ashby',
    firstName: 'Jordan',
    lastName: 'Nguyen',
    email: 'jordan.devops.role3@jobfitly.test',
    phone: '2065550103',
    city: 'Seattle',
    state: 'Washington',
    postal: '98101',
    address1: '800 Pike St',
    company: 'HashiCorp',
    title: 'DevOps Engineer',
    skills: ['Kubernetes', 'Terraform', 'CI/CD', 'AWS', 'Prometheus'],
    education: { school: 'University of Washington', degree: 'BS', field: 'Computer Engineering' },
    gender: 'Non-binary',
    ethnicity: 'Asian',
    sponsorship: 'No',
    hearAbout: 'Referral',
  },
  {
    key: 'frontend',
    displayName: 'Role Frontend User',
    portal: 'greenhouse',
    firstName: 'Sam',
    lastName: 'Okoye',
    email: 'sam.frontend.role4@jobfitly.test',
    phone: '6465550104',
    city: 'New York',
    state: 'New York',
    postal: '10001',
    address1: '350 5th Ave',
    company: 'Figma',
    title: 'Frontend Engineer',
    skills: ['React', 'TypeScript', 'CSS', 'Accessibility', 'Vite'],
    education: { school: 'NYU', degree: 'BS', field: 'Interactive Media' },
    gender: 'Female',
    ethnicity: 'Black or African American',
    sponsorship: 'No',
    hearAbout: 'LinkedIn',
  },
  {
    key: 'backend',
    displayName: 'Role Backend User',
    portal: 'workday',
    firstName: 'Diego',
    lastName: 'Martinez',
    email: 'diego.backend.role5@jobfitly.test',
    phone: '3125550105',
    city: 'Chicago',
    state: 'Illinois',
    postal: '60601',
    address1: '233 S Wacker Dr',
    company: 'Uber',
    title: 'Backend Engineer',
    skills: ['Go', 'Kafka', 'PostgreSQL', 'gRPC', 'Redis'],
    education: { school: 'UIUC', degree: 'MS', field: 'Computer Science' },
    gender: 'Male',
    ethnicity: 'Hispanic or Latino',
    sponsorship: 'Yes',
    hearAbout: 'Indeed',
  },
  {
    key: 'data',
    displayName: 'Role Data Scientist User',
    portal: 'ashby',
    firstName: 'Maya',
    lastName: 'Patel',
    email: 'maya.data.role6@jobfitly.test',
    phone: '6175550106',
    city: 'Boston',
    state: 'Massachusetts',
    postal: '02108',
    address1: '1 Beacon St',
    company: 'Databricks',
    title: 'Data Scientist',
    skills: ['Python', 'ML', 'Spark', 'SQL', 'Experimentation'],
    education: { school: 'MIT', degree: 'MS', field: 'Data Science' },
    gender: 'Female',
    ethnicity: 'South Asian',
    sponsorship: 'Yes',
    hearAbout: 'University career fair',
  },
  {
    key: 'product',
    displayName: 'Role Product Manager User',
    portal: 'lever',
    firstName: 'Chris',
    lastName: 'Baker',
    email: 'chris.product.role7@jobfitly.test',
    phone: '3035550107',
    city: 'Denver',
    state: 'Colorado',
    postal: '80202',
    address1: '1700 Lincoln St',
    company: 'Atlassian',
    title: 'Product Manager',
    skills: ['Roadmapping', 'User research', 'Metrics', 'A/B testing', 'SQL'],
    education: { school: 'CU Boulder', degree: 'MBA', field: 'Product Management' },
    gender: 'Male',
    ethnicity: 'White',
    sponsorship: 'No',
    hearAbout: 'LinkedIn',
  },
  {
    key: 'qa',
    displayName: 'Role QA User',
    portal: 'lever',
    firstName: 'Riley',
    lastName: 'Kim',
    email: 'riley.qa.role8@jobfitly.test',
    phone: '5035550108',
    city: 'Portland',
    state: 'Oregon',
    postal: '97201',
    address1: '111 SW 5th Ave',
    company: 'Nike',
    title: 'QA Engineer',
    skills: ['Playwright', 'Cypress', 'Test strategy', 'API testing', 'CI'],
    education: { school: 'Oregon State', degree: 'BS', field: 'Software Engineering' },
    gender: 'Female',
    ethnicity: 'East Asian',
    sponsorship: 'No',
    hearAbout: 'Employee referral',
  },
  {
    key: 'mobile',
    displayName: 'Role Mobile User',
    portal: 'workday',
    firstName: 'Taylor',
    lastName: 'Brooks',
    email: 'taylor.mobile.role9@jobfitly.test',
    phone: '4045550109',
    city: 'Atlanta',
    state: 'Georgia',
    postal: '30303',
    address1: '191 Peachtree St',
    company: 'Snap',
    title: 'Mobile Engineer',
    skills: ['Swift', 'Kotlin', 'React Native', 'iOS', 'Android'],
    education: { school: 'Georgia Tech', degree: 'BS', field: 'Computer Science' },
    gender: 'Male',
    ethnicity: 'White',
    sponsorship: 'No',
    hearAbout: 'Company career page',
  },
  {
    key: 'security',
    displayName: 'Role Security User',
    portal: 'greenhouse',
    firstName: 'Aisha',
    lastName: 'Hassan',
    email: 'aisha.security.role10@jobfitly.test',
    phone: '7035550110',
    city: 'Arlington',
    state: 'Virginia',
    postal: '22201',
    address1: '1100 Wilson Blvd',
    company: 'CrowdStrike',
    title: 'Security Engineer',
    skills: ['AppSec', 'Threat modeling', 'Python', 'SIEM', 'Penetration testing'],
    education: { school: 'George Mason', degree: 'MS', field: 'Cybersecurity' },
    gender: 'Female',
    ethnicity: 'Black or African American',
    sponsorship: 'No',
    hearAbout: 'Security conference',
  },
];

function buildParsed(role) {
  const locShort = `${role.city}, ${abbrevState(role.state)}`;
  const phone = {
    country: 'United States',
    countryCode: '+1',
    nationalNumber: role.phone,
  };
  return {
    personalInfo: {
      fullName: `${role.firstName} ${role.lastName}`,
      firstName: role.firstName,
      lastName: role.lastName,
      email: role.email,
      phone,
      linkedin: `https://www.linkedin.com/in/${role.firstName.toLowerCase()}${role.lastName.toLowerCase()}/`,
      location: locShort,
      website: '',
    },
    workExperience: [
      {
        title: role.title,
        company: role.company,
        location: locShort,
        startDate: '2021',
        endDate: 'Present',
        achievements: [
          `Delivered ${role.title} outcomes at ${role.company}`,
          `Used ${role.skills.slice(0, 3).join(', ')} on production systems`,
        ],
      },
      {
        title: `Junior ${role.title.split(' ').slice(-1)[0]}`,
        company: 'Prior Co',
        location: locShort,
        startDate: '2018',
        endDate: '2021',
        achievements: ['Shipped features and improved team processes'],
      },
    ],
    extraAnswers: {
      consent: 'I agree',
      'i agree': 'I agree',
    },
    education: [role.education],
    skills: role.skills,
    sponsorshipRequired: role.sponsorship === 'Yes',
    applicationProfile: {
      displayName: role.displayName,
      preferredName: role.firstName,
      pronouns: role.gender === 'Female' ? 'She/her' : role.gender === 'Male' ? 'He/him' : 'They/them',
      phone,
      country: 'United States',
      address1: role.address1,
      address2: 'Apt 2',
      city: role.city,
      state: role.state,
      postal: role.postal,
      location: locShort,
      linkedin: `https://www.linkedin.com/in/${role.firstName.toLowerCase()}${role.lastName.toLowerCase()}/`,
      github: role.key === 'business' || role.key === 'product' ? '' : `https://github.com/${role.firstName.toLowerCase()}${role.key}`,
      website: '',
      phoneDeviceType: 'Mobile',
      workAuthUS: 'Yes',
      sponsorshipRequired: role.sponsorship,
      age18Plus: 'Yes',
      previouslyEmployed: 'No',
      inBayArea: /san francisco|oakland|palo alto|san jose|bay area/i.test(`${role.city}`) ? 'Yes' : 'No',
      hearAbout: role.hearAbout,
      availableFrom: '2 weeks',
      gender: role.gender,
      transgender: 'No',
      orientation: 'Heterosexual',
      ethnicity: role.ethnicity,
      disability: 'No',
      veteran: 'No military service',
    },
    _parseAudit: {
      parseMethod: 'seed-role',
      needsReview: false,
      message: `Seeded ${role.displayName} (${role.key})`,
      roleKey: role.key,
    },
  };
}

function abbrevState(state) {
  const map = {
    Texas: 'TX', California: 'CA', Washington: 'WA', 'New York': 'NY', Illinois: 'IL',
    Massachusetts: 'MA', Colorado: 'CO', Oregon: 'OR', Georgia: 'GA', Virginia: 'VA',
  };
  return map[state] || state;
}

async function main() {
  const seeded = [];

  for (const role of ROLES) {
    const parsedData = buildParsed(role);
    const portalMeta = PORTALS[role.portal];
    const profile = await profileService.upsertNamedProfile({
      displayName: role.displayName,
      rawText: `${role.displayName} — ${role.firstName} ${role.lastName} — ${role.title} @ ${role.company} — ${role.email} — +1 ${role.phone}`,
      parsedData,
    });
    const facts = buildFacts(profile.parsedData);
    const entry = {
      key: role.key,
      id: profile.id,
      displayName: role.displayName,
      roleTitle: role.title,
      company: role.company,
      email: role.email,
      phone: role.phone,
      firstName: role.firstName,
      lastName: role.lastName,
      city: role.city,
      portal: role.portal,
      jobUrl: portalMeta.url,
      jobTitle: portalMeta.title,
      captureComplete: !!profile.parsedData.applicationProfile?.captureComplete,
      facts: {
        phone: facts.phone,
        phoneCountryLabel: facts.phoneCountryLabel,
        city: facts.city,
        currentTitle: facts.currentTitle,
        currentCompany: facts.currentCompany,
      },
    };
    seeded.push(entry);
    console.log(`✓ ${role.displayName} → ${profile.id} @ ${role.portal}`);
  }

  const out = {
    seededAt: new Date().toISOString(),
    count: seeded.length,
    portals: PORTALS,
    profiles: seeded,
  };

  const fixturePath = path.join(
    __dirname,
    '../../extension/e2e/fixtures/role-profiles.seeded.json',
  );
  fs.mkdirSync(path.dirname(fixturePath), { recursive: true });
  fs.writeFileSync(fixturePath, JSON.stringify(out, null, 2));
  console.log(`\nWrote ${fixturePath}`);
  console.log(JSON.stringify({ count: seeded.length, ids: seeded.map((s) => ({ key: s.key, id: s.id, portal: s.portal })) }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
