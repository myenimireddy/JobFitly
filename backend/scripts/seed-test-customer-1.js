#!/usr/bin/env node
'use strict';

/**
 * Seed "Test Customer 1" — mock applicationProfile with split phone object.
 * No real personal data — safe for fixtures / live ATS dry-runs (do not submit).
 * Usage: node scripts/seed-test-customer-1.js
 */

require('dotenv').config();
const { prisma } = require('../src/lib/prisma');
const profileService = require('../src/modules/profile/service');
const { buildFacts } = require('../src/modules/autofill/logic');

async function main() {
  const parsedData = {
    personalInfo: {
      fullName: 'Alex Rivera',
      firstName: 'Alex',
      lastName: 'Rivera',
      email: 'alex.rivera@example.com',
      phone: {
        country: 'United States',
        countryCode: '+1',
        nationalNumber: '5551234567',
      },
      linkedin: 'https://www.linkedin.com/in/alexrivera-test/',
      location: 'Austin, TX',
      website: '',
    },
    workExperience: [
      {
        title: 'Senior Software Engineer',
        company: 'Acme Corp',
        location: 'Austin, TX',
        startDate: '2020',
        endDate: 'Present',
        achievements: ['Built platforms and APIs', 'Led autofill and hiring tooling'],
      },
      {
        title: 'Software Engineer',
        company: 'Prior Co',
        location: 'Austin, TX',
        startDate: '2016',
        endDate: '2020',
        achievements: ['Shipped product features'],
      },
    ],
    extraAnswers: {
      consent: 'I agree',
      'i agree': 'I agree',
    },
    education: [
      { school: 'State University', degree: 'BS', field: 'Computer Science' },
    ],
    skills: ['JavaScript', 'React', 'Node.js', 'Python', 'AWS'],
    sponsorshipRequired: true,
    applicationProfile: {
      displayName: 'Test Customer 1',
      preferredName: 'Alex',
      pronouns: 'They/them',
      phone: {
        country: 'United States',
        countryCode: '+1',
        nationalNumber: '5551234567',
      },
      country: 'United States',
      address1: '100 Test Street',
      address2: 'Suite 200',
      city: 'Austin',
      state: 'Texas',
      postal: '78701',
      location: 'Austin, TX',
      linkedin: 'https://www.linkedin.com/in/alexrivera-test/',
      github: '',
      website: '',
      phoneDeviceType: 'Mobile',
      workAuthUS: 'Yes',
      sponsorshipRequired: 'Yes',
      age18Plus: 'Yes',
      previouslyEmployed: 'No',
      inBayArea: 'No',
      hearAbout: 'LinkedIn',
      availableFrom: '2 weeks',
      gender: 'Male',
      transgender: 'No',
      orientation: 'Heterosexual',
      ethnicity: 'South Asian',
      disability: 'No',
      veteran: 'No military service',
    },
    _parseAudit: {
      parseMethod: 'seed',
      needsReview: false,
      message: 'Seeded mock Test Customer 1 for portal autofill validation',
    },
  };

  const profile = await profileService.upsertNamedProfile({
    displayName: 'Test Customer 1',
    rawText: 'Test Customer 1 — Alex Rivera — Acme Corp — Austin TX — alex.rivera@example.com — +1 5551234567',
    parsedData,
  });

  const facts = buildFacts(profile.parsedData);
  console.log(JSON.stringify({
    id: profile.id,
    displayName: profile.parsedData.applicationProfile?.displayName,
    captureComplete: profile.parsedData.applicationProfile?.captureComplete,
    phone: profile.parsedData.applicationProfile?.phone,
    facts: {
      phone: facts.phone,
      phoneCountryLabel: facts.phoneCountryLabel,
      country: facts.country,
      city: facts.city,
      workAuth: facts.workAuth,
      sponsorship: facts.sponsorship,
      ethnicity: facts.ethnicity,
    },
  }, null, 2));

  console.log(`\nSeeded Test Customer 1 → ${profile.id}`);
  console.log('Set localStorage jobfitcheck_profile_id to this id in the web app / extension.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
