# nodeBlox

nodeBlox is a Roblox-inspired module that recommends games and servers for groups of players. A **Party** is a group that plays together. An **experience** is what Roblox calls a game.

Four arrays inside `MattAnsel_nodeBlox.js` store players, Parties, experiences and servers.

## Setup

Node.js version used: **v24.22.0**.

## How to use

Load the module from another JavaScript file, or open the Node.js console with `node` in the module's folder and enter:

```js
const nodeBlox = require('./MattAnsel_nodeBlox');
```

Use the examples below to call its functions. Each function returns a JavaScript object. `code` describes the result, and `data` contains the returned details when available. For eligibility checks, `ok` and `data.eligible` show whether the Party can enter the game.

These IDs identify the records used in the examples:

| ID | Record |
| --- | --- |
| `PTY001` | AfterClassSquad: ByteNova and CloudMika |
| `PTY002` | CompetingSquad: PixelKai and EchoLyn |
| `EXP001` | Skyline Sprint |
| `EXP002` | Squad Arena |
| `EXP003` | Circuit Combat: computer only |
| `SRV001`, `SRV002` | Public Squad Arena servers |

## 1. Check whether a Party can enter a game

`assessPartyEligibility(partyId, experienceId)` checks the Party's size, player devices and content permissions against the game's requirements.

- `partyId`: the ID of the Party to check.
- `experienceId`: the ID of the game it wants to enter.

```js
console.log(nodeBlox.assessPartyEligibility('PTY001', 'EXP003'));
```

In this example, `ok: false` and `data.eligible: false` show that AfterClassSquad cannot enter Circuit Combat. The `reasons` list explains that CloudMika uses an unsupported device: the game supports computers, while CloudMika uses mobile. The other examples use Squad Arena, which supports both members' devices.

## 2. Rank games for a Party

`rankGroupExperiences(partyId, fairnessWeight)` ranks accessible games using the group's average preference and its lowest member preference.

- `partyId`: the ID of the Party whose preferences are considered.
- `fairnessWeight`: optional; controls how much the lowest preference affects the score. The preset is `0.4`.

```js
console.log(nodeBlox.rankGroupExperiences('PTY001'));
```

The games appear in `data.rankedExperiences`, with the highest `experienceScore` first.

## 3. Find servers that can accept a Party

`findSuitableServers(partyId, experienceId)` finds available public servers for the game that have room for the entire Party.

- `partyId`: the ID of the Party that needs space.
- `experienceId`: the ID of the game whose servers are checked.

```js
console.log(nodeBlox.findSuitableServers('PTY001', 'EXP002'));
```

`data.eligibleServers` lists servers the Party can join. `data.rejectedServers` explains why the others were excluded.

## 4. Score suitable servers

`scoreServers(partyId, serverIds, configuration)` ranks suitable servers by their highest estimated connection delay among the Party's members. Lower delay gives a higher score.

- `partyId`: the ID of the Party being considered.
- `serverIds`: an array of server IDs, such as those returned by `findSuitableServers()`.
- `configuration`: optional; an object containing `latencyCapMs`. The preset cutoff is `250` milliseconds.

```js
console.log(nodeBlox.scoreServers('PTY001', ['SRV001', 'SRV002']));
```

The results appear in `data.rankedServers`, with the highest `serverScore` first.

## 5. Recommend a shared plan

`optimizePartyMatch(partyIds)` compares game-and-server choices for both Parties and returns the highest-scoring plan that keeps each Party together and fits the available server spaces.

- `partyIds`: an array containing the two Party IDs to compare.

```js
console.log(nodeBlox.optimizePartyMatch(['PTY001', 'PTY002']));
```

`data.assignments` contains the recommended matches. `data.totalMatchScore` gives their combined score. The function recommends assignments without changing stored server occupancy.

## References

- [Roblox. (n.d.). *Party FAQ*. Roblox Support.](https://en.help.roblox.com/hc/en-us/articles/32461054421012-Party-FAQ)
- [OpenStax. (n.d.). *13.1 Measures of center*. In *Principles of finance 2e*.](https://openstax.org/books/principles-finance-2e/pages/13-1-measures-of-center)
- [Goyette, B. (2016). *Fighting latency on Call of Duty: Black Ops III* [Conference presentation video]. Game Developers Conference. YouTube.](https://www.youtube.com/watch?v=EtLHLfNpu84) ([GDC session details](https://gdcvault.com/play/1023220/Fighting-Latency-on-Call-of))
- [Skittle Sniper. (2026, June 2). *Basic connections troubleshooting guide*. Riot Games, League of Legends Support.](https://support.riotgames.com/en-us/league-of-legends/connectivity/basic-connections-troubleshooting-guide)
- [MDN contributors. (n.d.). *Array*. MDN Web Docs.](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array)
- [MDN contributors. (n.d.). *Math.max()*. MDN Web Docs.](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/max)
- [MDN contributors. (n.d.). *Math.abs()*. MDN Web Docs.](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/abs)
- [MDN contributors. (n.d.). *Number*. MDN Web Docs.](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)
- [Node.js. (n.d.). *Modules: CommonJS modules*. Node.js documentation.](https://nodejs.org/api/modules.html)
- [Node.js. (n.d.). *Console*. Node.js documentation.](https://nodejs.org/api/console.html)

## AI use

AI was used to generate mock data and suggest ideas for the application and its functions based on the chosen website, Roblox. AI also assisted with implementing, testing and refining the code.
