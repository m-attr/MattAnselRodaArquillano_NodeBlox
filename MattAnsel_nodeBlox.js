'use strict';

// ============================ CONFIGURATION ===========================

const config = {
  partyLimits: { minMembers: 2, maxMembers: 6 },
  fairnessWeight: 0.4,
  serverScoring: {
    latencyCapMs: 250
  },
  optimization: {
    weights: { preference: 0.6, serverQuality: 0.4 },
    maxMatchOptionsPerParty: 6
  }
};

// ============================== MOCK DATA =============================

const mockData = {
  players: [
    {
      id: 'P001', displayName: 'ByteNova', deviceType: 'computer',
      allowedContentLabels: ['minimal', 'mild', 'moderate'],
      preferencesByExperience: { EXP001: 10, EXP002: 6, EXP003: 8 }
    },
    {
      id: 'P002', displayName: 'CloudMika', deviceType: 'mobile',
      allowedContentLabels: ['minimal', 'mild'],
      preferencesByExperience: { EXP001: 0, EXP002: 6, EXP003: 8 }
    },
    {
      id: 'P003', displayName: 'PixelKai', deviceType: 'mobile',
      allowedContentLabels: ['minimal', 'mild'],
      preferencesByExperience: { EXP001: 9, EXP002: 10, EXP003: 8 }
    },
    {
      id: 'P004', displayName: 'EchoLyn', deviceType: 'console',
      allowedContentLabels: ['minimal', 'mild', 'moderate'],
      preferencesByExperience: { EXP001: 9, EXP002: 10, EXP003: 8 }
    }
  ],
  parties: [
    { id: 'PTY001', name: 'AfterClassSquad', memberIds: ['P001', 'P002'] },
    { id: 'PTY002', name: 'CompetingSquad', memberIds: ['P003', 'P004'] }
  ],
  experiences: [
    {
      id: 'EXP001', title: 'Skyline Sprint', available: true,
      supportedDevices: ['computer', 'mobile', 'console'], contentLabel: 'mild',
      maxPlayersPerServer: 6, partySizeLimit: 6
    },
    {
      id: 'EXP002', title: 'Squad Arena', available: true,
      supportedDevices: ['computer', 'mobile', 'console'], contentLabel: 'mild',
      maxPlayersPerServer: 6, partySizeLimit: 6
    },
    {
      id: 'EXP003', title: 'Circuit Combat', available: true,
      supportedDevices: ['computer'], contentLabel: 'mild',
      maxPlayersPerServer: 6, partySizeLimit: 6
    }
  ],
  servers: [
    {
      id: 'SRV001', experienceId: 'EXP002', status: 'available', accessType: 'public',
      capacity: 6, currentPlayers: 4,
      estimatedLatencyMsByPlayer: { P001: 20, P002: 30, P003: 20, P004: 25 }
    },
    {
      id: 'SRV002', experienceId: 'EXP002', status: 'available', accessType: 'public',
      capacity: 6, currentPlayers: 4,
      estimatedLatencyMsByPlayer: { P001: 55, P002: 65, P003: 170, P004: 180 }
    },
    {
      id: 'SRV003', experienceId: 'EXP001', status: 'available', accessType: 'public',
      capacity: 6, currentPlayers: 4,
      estimatedLatencyMsByPlayer: { P001: 40, P002: 50, P003: 125, P004: 135 }
    },
    {
      id: 'SRV004', experienceId: 'EXP002', status: 'shutting_down', accessType: 'private',
      capacity: 6, currentPlayers: 5,
      estimatedLatencyMsByPlayer: { P001: 10, P002: 15, P003: 10, P004: 15 }
    }
  ]
};

// ========================== HELPER FUNCTIONS ==========================

// finds a Party and returns its player records when membership is valid.
function getPartyMembers(partyId) {
  //#region Lookup and input checks
  const party = mockData.parties.find(partyRecord => partyRecord.id === partyId);

  if (!party) {
    return { ok: false, code: 'PARTY_NOT_FOUND', message: 'Party ID was not found.' };
  }

  const { minMembers, maxMembers } = config.partyLimits || {};

  if (!Number.isInteger(minMembers) || !Number.isInteger(maxMembers)
    || minMembers < 2 || maxMembers > 6 || minMembers > maxMembers) {
    return { ok: false, code: 'INVALID_CONFIGURATION', message: 'Party limits must be between 2 and 6.' };
  }

  if (!Array.isArray(party.memberIds) || party.memberIds.length < minMembers || party.memberIds.length > maxMembers) {
    return { ok: false, code: 'INVALID_PARTY_SIZE', message: 'Party size is outside the configured limits.' };
  }
  //#endregion

  // MAIN LOGIC: find each player belonging to this Party and collect their records.
  const partyMembers = [];

  for (const playerId of party.memberIds) {
    const player = mockData.players.find(playerRecord => playerRecord.id === playerId);

    //#region Player-record checks
    if (!player || typeof player.deviceType !== 'string' || !Array.isArray(player.allowedContentLabels)) {
      return { ok: false, code: 'INVALID_PLAYER', message: 'A Party member is missing or has invalid access information.' };
    }

    if (partyMembers.some(member => member.id === playerId)) {
      return { ok: false, code: 'DUPLICATE_MEMBER', message: 'A player cannot appear twice in one Party.' };
    }
    //#endregion

    partyMembers.push(player);
  }

  return { ok: true, party, partyMembers };
}

// builds and ranks the eligible game-and-server combinations for one Party.
function buildPartyMatchOptions(partyId) {
  // Calculations:
  // experience score /100 = experienceScore x 10
  // matchScore = preference weight x experienceScore x 10 + server weight x serverScore

  //#region Get accessible experiences and handle lookup errors
  const experienceRankingResult = rankGroupExperiences(partyId);

  if (!experienceRankingResult.ok) {
    return experienceRankingResult;
  }
  //#endregion

  // MAIN LOGIC: pair each accessible experience with its suitable, scored servers.
  const matchOptions = [];
  const matchWeights = config.optimization.weights;

  for (const rankedExperience of experienceRankingResult.data.rankedExperiences) {
    const suitableServersResult = findSuitableServers(partyId, rankedExperience.experienceId);

    //#region Handle server lookup results
    if (!suitableServersResult.ok) {
      if (suitableServersResult.code === 'NO_SUITABLE_SERVERS') {
        continue;
      }

      return suitableServersResult;
    }
    //#endregion

    const serverIds = suitableServersResult.data.eligibleServers.map(server => server.serverId);
    const serverScoresResult = scoreServers(partyId, serverIds);

    //#region Server-scoring error check
    if (!serverScoresResult.ok) {
      return serverScoresResult;
    }
    //#endregion

    for (const rankedServer of serverScoresResult.data.rankedServers) {
      matchOptions.push({
        partyId,
        partyName: experienceRankingResult.data.partyName,
        experienceId: rankedExperience.experienceId,
        experienceTitle: rankedExperience.title,
        serverId: rankedServer.serverId,
        memberCount: suitableServersResult.data.memberCount,
        experienceScore: rankedExperience.experienceScore,
        serverScore: rankedServer.serverScore,
        matchScore: matchWeights.preference * rankedExperience.experienceScore * 10
          + matchWeights.serverQuality * rankedServer.serverScore
      });
    }
  }

  matchOptions.sort((firstOption, secondOption) => secondOption.matchScore - firstOption.matchScore);

  return { ok: true, matchOptions };
}

// =========================== MAIN FUNCTIONS ===========================

// returns whether every Party member can enter the selected experience, with reasons if they cannot.
function assessPartyEligibility(partyId, experienceId) {
  //#region Lookup and input checks
  const partyResult = getPartyMembers(partyId);

  if (!partyResult.ok) {
    return partyResult;
  }

  const experience = mockData.experiences.find(experienceRecord => experienceRecord.id === experienceId);

  if (!experience) {
    return { ok: false, code: 'EXPERIENCE_NOT_FOUND', message: 'Experience ID was not found.' };
  }

  if (typeof experience.available !== 'boolean' || !Array.isArray(experience.supportedDevices)
    || experience.supportedDevices.length === 0 || typeof experience.contentLabel !== 'string'
    || !Number.isInteger(experience.maxPlayersPerServer) || experience.maxPlayersPerServer < 1
    || !Number.isInteger(experience.partySizeLimit) || experience.partySizeLimit < 1
    || experience.partySizeLimit > experience.maxPlayersPerServer) {
    return { ok: false, code: 'INVALID_EXPERIENCE', message: 'Experience access rules or size limits are invalid.' };
  }
  //#endregion

  // MAIN LOGIC: collect the access restrictions that prevent the Party from joining.
  const reasons = [];

  if (!experience.available) reasons.push({ message: 'The experience is unavailable.' });
  if (partyResult.partyMembers.length > experience.partySizeLimit) reasons.push({ message: 'The Party exceeds the experience size limit.' });

  for (const member of partyResult.partyMembers) {
    if (!experience.supportedDevices.includes(member.deviceType)) {
      reasons.push({ message: member.displayName + ' uses an unsupported device.' });
    }

    if (!member.allowedContentLabels.includes(experience.contentLabel)) {
      reasons.push({ message: member.displayName + ' does not have permission for this content.' });
    }
  }

  const eligible = reasons.length === 0;

  return {
    ok: eligible,
    code: eligible ? 'OK' : 'PARTY_INELIGIBLE',
    data: {
      partyId, partyName: partyResult.party.name,
      memberNames: partyResult.partyMembers.map(member => member.displayName),
      memberDetails: partyResult.partyMembers.map(member => ({
        displayName: member.displayName,
        deviceType: member.deviceType
      })),
      experienceId, experienceTitle: experience.title, eligible,
      memberCount: partyResult.partyMembers.length,
      maxPlayersPerServer: experience.maxPlayersPerServer
    },
    reasons
  };
}

// ranks accessible experiences by balancing group preference with the least satisfied member.
function rankGroupExperiences(partyId, fairnessWeight = config.fairnessWeight) {
  // Calculations:
  // averagePreference = totalPreference / number of Party members
  // experienceScore = (1 - fairnessWeight) x averagePreference + fairnessWeight x lowestPreference

  //#region Lookup and input checks
  const partyResult = getPartyMembers(partyId);

  if (!partyResult.ok) {
    return partyResult;
  }

  if (!Number.isFinite(fairnessWeight) || fairnessWeight < 0 || fairnessWeight > 1) {
    return { ok: false, code: 'INVALID_FAIRNESS_WEIGHT', message: 'Fairness weight must be between 0 and 1.' };
  }
  //#endregion

  // MAIN LOGIC: exclude inaccessible experiences and calculate each remaining score.
  const rankedExperiences = [];
  const rejectedExperiences = [];

  for (const experience of mockData.experiences) {
    const eligibilityResult = assessPartyEligibility(partyId, experience.id);

    if (!eligibilityResult.ok) {
      //#region Unexpected eligibility-data error
      if (eligibilityResult.code !== 'PARTY_INELIGIBLE') {
        return eligibilityResult;
      }
      //#endregion

      rejectedExperiences.push({ experienceId: experience.id, title: experience.title, reasons: eligibilityResult.reasons });
      continue;
    }

    let totalPreference = 0;
    let lowestPreference = 10;

    for (const member of partyResult.partyMembers) {
      const preference = member.preferencesByExperience && member.preferencesByExperience[experience.id];

      //#region Preference-data check
      if (!Number.isFinite(preference) || preference < 0 || preference > 10) {
        return { ok: false, code: 'INVALID_PREFERENCE', message: 'Each member needs a preference from 0 to 10.' };
      }
      //#endregion

      totalPreference += preference;

      if (preference < lowestPreference) {
        lowestPreference = preference;
      }
    }

    const averagePreference = totalPreference / partyResult.partyMembers.length;

    rankedExperiences.push({
      experienceId: experience.id,
      title: experience.title,
      averagePreference,
      lowestPreference,
      experienceScore: (1 - fairnessWeight) * averagePreference + fairnessWeight * lowestPreference
    });
  }

  rankedExperiences.sort((firstExperience, secondExperience) => secondExperience.experienceScore - firstExperience.experienceScore);
  rankedExperiences.forEach((experience, index) => { experience.rank = index + 1; });

  return {
    ok: rankedExperiences.length > 0,
    code: rankedExperiences.length ? 'OK' : 'NO_ELIGIBLE_EXPERIENCES',
    message: rankedExperiences.length ? '' : 'No experience is accessible to the whole Party.',
    data: {
      partyId, partyName: partyResult.party.name,
      rankedExperiences, rejectedExperiences, fairnessWeight,
      experienceOverview: mockData.experiences.map(experience => ({
        experienceId: experience.id,
        title: experience.title,
        supportedDevices: experience.supportedDevices.slice()
      }))
    }
  };
}

// returns servers that can accept the whole Party, with reasons for rejected servers.
function findSuitableServers(partyId, experienceId) {
  //#region Check Party eligibility
  const eligibilityResult = assessPartyEligibility(partyId, experienceId);

  if (!eligibilityResult.ok) {
    return eligibilityResult;
  }
  //#endregion

  // MAIN LOGIC: separate servers that meet the access and capacity rules from those that do not.
  const memberCount = eligibilityResult.data.memberCount;
  const eligibleServers = [];
  const rejectedServers = [];

  for (const server of mockData.servers) {
    const reasons = [];

    if (server.experienceId !== experienceId) reasons.push({ message: 'The server belongs to another experience.' });
    if (server.status !== 'available') reasons.push({ message: 'The server is unavailable.' });
    if (server.accessType !== 'public') reasons.push({ message: 'The server is private or reserved.' });

    //#region Server-data check
    if (!Number.isInteger(server.capacity) || server.capacity < 1 || !Number.isInteger(server.currentPlayers)
      || server.currentPlayers < 0 || server.currentPlayers > server.capacity
      || (server.experienceId === experienceId && server.capacity > eligibilityResult.data.maxPlayersPerServer)) {
      return { ok: false, code: 'INVALID_SERVER_DATA', message: 'Server capacity or occupancy is invalid.' };
    }
    //#endregion

    if (server.currentPlayers + memberCount > server.capacity) reasons.push({ message: 'There is not enough space for the whole Party.' });

    if (reasons.length) {
      rejectedServers.push({ serverId: server.id, reasons });
    } else {
      eligibleServers.push({
        serverId: server.id,
        capacity: server.capacity,
        freeSlots: server.capacity - server.currentPlayers,
        projectedOccupancy: server.currentPlayers + memberCount
      });
    }
  }

  return {
    ok: eligibleServers.length > 0,
    code: eligibleServers.length ? 'OK' : 'NO_SUITABLE_SERVERS',
    message: eligibleServers.length ? '' : 'No server can accept the whole Party.',
    data: {
      partyId, partyName: eligibilityResult.data.partyName,
      experienceId, experienceTitle: eligibilityResult.data.experienceTitle,
      memberCount, eligibleServers, rejectedServers,
      // return display fields only; the private server records stay unchanged.
      serverOverview: mockData.servers.map(server => ({
        serverId: server.id,
        experienceId: server.experienceId,
        currentPlayers: server.currentPlayers,
        capacity: server.capacity,
        status: server.status,
        accessType: server.accessType
      }))
    }
  };
}

// ranks suitable servers by connection delay, giving lower latency a higher score.
function scoreServers(partyId, serverIds, configuration = config.serverScoring) {
  // Calculation:
  // serverScore = max(0, 1 - highestMemberLatencyMs / latencyCapMs) x 100
  // The score is 100 at zero latency and 0 at or above the configured cutoff.

  //#region Lookup and input checks
  const partyResult = getPartyMembers(partyId);

  if (!partyResult.ok) {
    return partyResult;
  }

  if (!configuration || !Number.isFinite(configuration.latencyCapMs) || configuration.latencyCapMs <= 0) {
    return { ok: false, code: 'INVALID_CONFIGURATION', message: 'The latency cutoff must be a positive number.' };
  }

  if (!Array.isArray(serverIds) || !serverIds.length || serverIds.some((id, index) => serverIds.indexOf(id) !== index)) {
    return { ok: false, code: 'INVALID_CANDIDATES', message: 'Supply a nonempty array of unique registered server IDs.' };
  }

  const registeredServers = serverIds.map(id => mockData.servers.find(server => server.id === id));

  if (registeredServers.some(server => !server)) {
    return { ok: false, code: 'UNREGISTERED_SERVER', message: 'A candidate server ID was not found.' };
  }

  const experienceId = registeredServers[0].experienceId;

  if (registeredServers.some(server => server.experienceId !== experienceId)) {
    return { ok: false, code: 'MIXED_EXPERIENCES', message: 'Score servers for one experience at a time.' };
  }

  const suitableServersResult = findSuitableServers(partyId, experienceId);

  if (!suitableServersResult.ok) {
    return suitableServersResult;
  }
  //#endregion

  // MAIN LOGIC: find each server's highest member latency, calculate its score and rank it.
  const rankedServers = [];

  for (const server of registeredServers) {
    //#region Check this server is suitable
    if (!suitableServersResult.data.eligibleServers.some(eligibleServer => eligibleServer.serverId === server.id)) {
      return { ok: false, code: 'INELIGIBLE_SERVER', message: 'A candidate cannot accept this Party.' };
    }
    //#endregion

    let highestMemberLatencyMs = 0;

    for (const member of partyResult.partyMembers) {
      const latency = server.estimatedLatencyMsByPlayer && server.estimatedLatencyMsByPlayer[member.id];

      //#region Latency-data check
      if (!Number.isFinite(latency) || latency < 0) {
        return { ok: false, code: 'INVALID_LATENCY', message: 'Every member needs a finite, nonnegative latency estimate.' };
      }
      //#endregion

      if (latency > highestMemberLatencyMs) {
        highestMemberLatencyMs = latency;
      }
    }

    const serverScore = Math.max(0, 1 - highestMemberLatencyMs / configuration.latencyCapMs) * 100;

    rankedServers.push({
      serverId: server.id, experienceId, highestMemberLatencyMs,
      serverScore
    });
  }

  rankedServers.sort((firstServer, secondServer) => secondServer.serverScore - firstServer.serverScore);
  rankedServers.forEach((server, index) => { server.rank = index + 1; });

  return {
    ok: true,
    code: 'OK',
    data: {
      rankedServers,
      latencyCapMs: configuration.latencyCapMs
    }
  };
}

// returns the highest-scoring feasible game-and-server plan for exactly two different Parties.
function optimizePartyMatch(partyIds) {
  // Calculation:
  // totalMatchScore = firstMatch.matchScore + secondMatch.matchScore

  //#region Configuration and input checks
  const optimizationSettings = config.optimization;
  const matchWeights = optimizationSettings && optimizationSettings.weights;

  if (!optimizationSettings || !matchWeights
    || !Number.isInteger(optimizationSettings.maxMatchOptionsPerParty)
    || optimizationSettings.maxMatchOptionsPerParty < 1 || optimizationSettings.maxMatchOptionsPerParty > 6
    || !Number.isFinite(matchWeights.preference) || !Number.isFinite(matchWeights.serverQuality)
    || matchWeights.preference < 0 || matchWeights.serverQuality < 0
    || Math.abs(matchWeights.preference + matchWeights.serverQuality - 1) > 1e-10) {
    return { ok: false, code: 'INVALID_CONFIGURATION', message: 'Use at most 6 options per Party and nonnegative match weights summing to 1.' };
  }

  if (!Array.isArray(partyIds) || partyIds.length !== 2 || partyIds[0] === partyIds[1]) {
    return { ok: false, code: 'INVALID_PARTIES', message: 'Supply exactly two different Party IDs.' };
  }
  //#endregion

  //#region Prepare match options and validate Party membership
  const partyMatchOptions = [];
  const assignedPlayerIds = [];

  for (const partyId of partyIds.slice().sort()) {
    const partyResult = getPartyMembers(partyId);

    if (!partyResult.ok) {
      return partyResult;
    }

    for (const member of partyResult.partyMembers) {
      if (assignedPlayerIds.includes(member.id)) {
        return { ok: false, code: 'OVERLAPPING_PARTIES', message: 'A player cannot belong to both Parties in the same plan.' };
      }

      assignedPlayerIds.push(member.id);
    }

    const matchOptionsResult = buildPartyMatchOptions(partyId);

    if (!matchOptionsResult.ok) {
      return matchOptionsResult;
    }

    if (!matchOptionsResult.matchOptions.length) {
      return { ok: false, code: 'INFEASIBLE_MATCH', message: partyId + ' has no suitable game-and-server combination.' };
    }

    if (matchOptionsResult.matchOptions.length > optimizationSettings.maxMatchOptionsPerParty) {
      return { ok: false, code: 'MATCH_OPTION_LIMIT_EXCEEDED', message: 'Too many options for this demonstration; none were discarded.' };
    }

    partyMatchOptions.push(matchOptionsResult.matchOptions);
  }
  //#endregion

  // MAIN LOGIC: compare option pairs, enforce shared capacity and keep the best valid plan.
  let bestAssignments = null;
  let bestTotalScore = 0;
  let optionPairsChecked = 0;
  let completePlansCompared = 0;

  for (const firstMatch of partyMatchOptions[0]) {
    for (const secondMatch of partyMatchOptions[1]) {
      optionPairsChecked++;

      if (firstMatch.serverId === secondMatch.serverId) {
        const sharedServer = mockData.servers.find(server => server.id === firstMatch.serverId);
        const requiredSlots = firstMatch.memberCount + secondMatch.memberCount;

        if (sharedServer.currentPlayers + requiredSlots > sharedServer.capacity) {
          continue;
        }
      }

      completePlansCompared++;
      const totalMatchScore = firstMatch.matchScore + secondMatch.matchScore;

      if (bestAssignments === null || totalMatchScore > bestTotalScore) {
        bestTotalScore = totalMatchScore;
        bestAssignments = [firstMatch, secondMatch];
      }
    }
  }

  //#region Return an explanation if no complete plan fits
  if (bestAssignments === null) {
    return { ok: false, code: 'INFEASIBLE_MATCH', message: 'No complete plan has enough shared capacity for both Parties.' };
  }
  //#endregion

  return {
    ok: true,
    code: 'OK',
    data: {
      assignments: bestAssignments,
      weights: { preference: matchWeights.preference, serverQuality: matchWeights.serverQuality },
      totalMatchScore: bestTotalScore,
      optimal: true,
      statistics: { optionPairsChecked, completePlansCompared }
    }
  };
}

// ============================== EXPORTS ===============================

module.exports = {
  assessPartyEligibility,
  rankGroupExperiences,
  findSuitableServers,
  scoreServers,
  optimizePartyMatch
};
