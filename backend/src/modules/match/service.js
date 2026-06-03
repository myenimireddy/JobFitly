const { prisma } = require('../../lib/prisma');
const { calculateSkillMatch, calculateFitScore, analyzeJobText } = require('../../lib/fallback');
const { analyzeMatchWithLLM } = require('../../lib/llmMatchAnalyzer');
const { checkLLM } = require('../../lib/llmStatus');

function serializeMatch(match) {
  return {
    ...match,
    resultData: typeof match.resultData === 'string'
      ? JSON.parse(match.resultData)
      : match.resultData,
  };
}

function generateRecommendations(missingSkills, blockers) {
  const recs = [];
  for (const skill of missingSkills.slice(0, 5)) {
    recs.push(`Build experience with ${skill} through projects or courses`);
  }
  for (const blocker of blockers) {
    recs.push(blocker.message);
  }
  return recs;
}

/**
 * Match service for gap analysis between profile and job
 */
class MatchService {
  /**
   * Create a match analysis between profile and job
   * @param {string} profileId - Profile CUID
   * @param {string} jobId - Job CUID
   * @returns {Promise<Object>} Match result with id, resultData, matchScore
   */
  async createMatch(profileId, jobId) {
    const [profileRow, jobRow] = await Promise.all([
      prisma.profile.findUnique({ where: { id: profileId } }),
      prisma.job.findUnique({ where: { id: jobId } }),
    ]);

    if (!profileRow) throw Object.assign(new Error('Profile not found'), { statusCode: 404 });
    if (!jobRow) throw Object.assign(new Error('Job not found'), { statusCode: 404 });

    const parsedProfile = typeof profileRow.parsedData === 'string'
      ? JSON.parse(profileRow.parsedData)
      : profileRow.parsedData;

    // Re-analyze job raw text for blockers + skill extraction
    const jobAnalysis = analyzeJobText(jobRow.rawHtml || '');

    const parsedJob = typeof jobRow.parsedData === 'string'
      ? JSON.parse(jobRow.parsedData)
      : (jobRow.parsedData || {});

    const llmStatus = await checkLLM();
    console.log(`[match] LLM status: ${llmStatus.available ? '✓' : '✗'} ${llmStatus.message}`);

    // Try LLM-based deep match analysis first
    let llmResult = null;
    if (llmStatus.available) {
      llmResult = await analyzeMatchWithLLM(parsedProfile, parsedJob);
    }

    let resultData;

    if (llmResult) {
      console.log(`[match] LLM analysis complete — score: ${llmResult.score}`);
      resultData = {
        matchScore: llmResult.score,
        scoreReasoning: llmResult.scoreReasoning,
        matchingSkills: llmResult.matchingSkills,
        missingSkills: llmResult.missingSkills,
        partialSkills: llmResult.partialSkills,
        blockers: llmResult.blockers,
        pros: llmResult.pros,
        recommendations: llmResult.recommendations,
        coverLetterTips: llmResult.coverLetterTips,
        experienceAssessment: llmResult.experienceAssessment,
        _analysisMethod: 'llm',
        _llmStatus: { usedForThisResult: true, available: true, message: `AI match analysis via ${llmStatus.provider}` },
      };
    } else {
      // Regex fallback
      console.warn('[match] LLM unavailable — falling back to regex match engine');
      const jobAnalysis = analyzeJobText(jobRow.rawHtml || '');
      const profileSkills = Array.isArray(parsedProfile.skills) ? parsedProfile.skills : [];
      const extractedJobSkills = [
        ...(parsedJob.requiredSkills || []),
        ...(parsedJob.preferredSkills || []),
        ...extractSkillsFromText(jobRow.rawHtml || ''),
      ].filter((v, i, a) => a.indexOf(v) === i);

      const skillMatch = calculateSkillMatch(profileSkills, extractedJobSkills);
      const score = calculateFitScore(jobAnalysis, { skills: profileSkills }, skillMatch);
      const recommendations = generateRecommendations(skillMatch.missing, jobAnalysis.blockers);

      resultData = {
        matchScore: score,
        matchingSkills: skillMatch.matched,
        missingSkills: skillMatch.missing,
        blockers: jobAnalysis.blockers,
        pros: jobAnalysis.pros,
        recommendations,
        skillCoverage: extractedJobSkills.length > 0
          ? Math.round((skillMatch.matched.length / extractedJobSkills.length) * 100) : 0,
        _analysisMethod: 'regex',
        _llmStatus: { usedForThisResult: false, available: false, message: llmStatus.message },
      };
    }

    const matchScore = resultData.matchScore ?? resultData.skillCoverage ?? 0;

    const existing = await prisma.match.findFirst({ where: { profileId, jobId } });

    let match;
    if (existing) {
      match = await prisma.match.update({
        where: { id: existing.id },
        data: { matchScore, resultData: JSON.stringify(resultData) },
      });
    } else {
      match = await prisma.match.create({
        data: { profileId, jobId, matchScore, resultData: JSON.stringify(resultData) },
      });
    }

    return serializeMatch(match);
  }

  /**
   * Get match by ID
   * @param {string} id - Match CUID
   * @returns {Promise<Object|null>}
   */
  async getById(id) {
    const match = await prisma.match.findUnique({
      where: { id },
      include: { profile: true, job: true },
    });
    if (!match) return null;
    return serializeMatch(match);
  }
}

/**
 * Simple skill extraction from raw job text using common tech keywords
 * @param {string} text
 * @returns {string[]}
 */
function extractSkillsFromText(text) {
  const KNOWN_SKILLS = [
    'javascript','typescript','python','java','go','rust','c++','c#','ruby','php','swift','kotlin',
    'react','vue','angular','svelte','next.js','nuxt','remix',
    'node.js','express','fastapi','django','flask','spring','rails',
    'aws','gcp','azure','docker','kubernetes','terraform','ansible',
    'postgresql','mysql','mongodb','redis','elasticsearch','sqlite',
    'graphql','rest','grpc','websockets',
    'git','ci/cd','github actions','jenkins','linux',
    'machine learning','ai','pytorch','tensorflow','pandas','numpy',
    'tailwind','css','html','figma','sass',
    'agile','scrum','jira','confluence',
  ];
  const lower = text.toLowerCase();
  return KNOWN_SKILLS.filter((skill) => lower.includes(skill));
}

module.exports = new MatchService();
