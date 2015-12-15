//function ajax_call(url) {
//	var xmlhttp;
//	if (window.XMLHttpRequest) {
//		// code for IE7+, Firefox, Chrome, Opera, Safari
//		xmlhttp=new XMLHttpRequest();
//	} else {
//		// code for IE6, IE5
//		xmlhttp=new ActiveXObject("Microsoft.XMLHTTP");
//	}
//
//	xmlhttp.open("GET", url, false);
//	xmlhttp.send();
//	return xmlhttp.responseText;
//}

// GET variables
function _GET(q, s) {
    s = s ? s : window.location.search;
    var re = new RegExp('&' + q + '(?:=([^&]*))?(?=&|$)', 'i');
    return (s = s.replace(/^\?/, '&').match(re)) ? (typeof s[1] == 'undefined' ? '' : decodeURIComponent(s[1])) : undefined;
}

function shuffle(this_array) {
    var i = this_array.length, j, tempi, tempj;
    if (i == 0) return false;
    while (--i) {
        j = Math.floor(Math.random() * (i + 1));
        tempi = this_array[i];
        tempj = this_array[j];
        this_array[i] = tempj;
        this_array[j] = tempi;
    }
}

function copy_deck(original_deck) {
    var new_deck = [];
    new_deck.commander = original_deck.commander;
    new_deck.deck = copy_card_list(original_deck.deck);
    return new_deck;
}

function copy_card_list(original_card_list) {
    var new_card_list = [];
    for (var key = 0, len = original_card_list.length; key < len; key++) {
        new_card_list[key] = original_card_list[key];
    }
    return new_card_list;
}

function cloneCard(original) {
    var copy = original.constructor();
    copy.__proto__ = original.__proto__;
    copy.id = original.id;
    copy.name = original.name;
    copy.attack = original.attack;
    copy.health = original.health;
    copy.maxLevel = original.maxLevel;
    copy.level = original.level;
    copy.cost = original.cost;
    copy.rarity = original.rarity;
    copy.card_type = original.card_type;
    copy.type = original.type;
    copy.sub_type = original.sub_type;
    copy.set = original.set;
    if (original.reusableSkills) {
        copy.skill = original.skill;
    } else {
        copy.skill = copy_skills(original.skill)[0];
    }
    copy.timer = copy.cost;
    copy.health_left = copy.health;
    return copy;
}

function cloneSkill(original) {

}

var MakeAssault = (function () {
    var Card = function (original_card, unit_level) {
        this.id = original_card.id;
        this.name = original_card.name;
        this.attack = original_card.attack;
        this.health = original_card.health;
        this.maxLevel = GetMaxLevel(original_card);
        this.level = ((unit_level > this.maxLevel) ? this.maxLevel : unit_level);
        this.cost = original_card.cost;
        this.rarity = original_card.rarity;
        this.card_type = original_card.card_type;
        this.type = original_card.type;
        this.sub_type = original_card.sub_type;
        this.set = original_card.set;
        var skillInfo = copy_skills(original_card.skill)
        this.skill = skillInfo[0];
        this.reusableSkills = skillInfo[1];
        if (this.level > 1) {
            var upgrade;
            for (var key in original_card.upgrades) {
                upgrade = original_card.upgrades[key];
                // Upgrade levels only contain attack/health/delay if they changed at that level.
                if (upgrade.cost !== undefined) this.cost = upgrade.cost;
                if (upgrade.health !== undefined) this.health = upgrade.health;
                if (upgrade.attack !== undefined) this.attack = upgrade.attack;
                if (key == this.level) break;
            }
            // Every upgrade level contains all skills at that level, so we only need the last one
            if (upgrade) update_skills(this.skill, upgrade.skill);
        }
        this.timer = this.cost;
        this.health_left = this.health;
        card_cache[original_card.id + "-" + unit_level] = this;
        return this;
    }

    Card.prototype = {
        p: null,
        health_left: 0,
        timer: 0,
        attack_rally: 0,
        attack_weaken: 0,
        key: undefined,
        // Statuses
        poisoned: 0,
        scorched: 0,
        enfeebled: 0,
        protected: 0,
        augmented: 0,
        jammed: false,

        //Card ID is ...
        isCommander: function () {
            return (this.card_type == "1");
        },

        isAssault: function () {
            return (!this.isCommander());
        },

        isBattleground: function () {
            return false;
        },

        // Alive
        // -.health_left > 0
        isAlive: function () {
            return (this.health_left > 0);
        },

        // Active
        // - timer = 0
        isActive: function () {
            return (this.timer == 0);
        },

        // Active Next Turn
        // - timer <=1
        isActiveNextTurn: function () {
            return (this.timer <= 1);
        },

        // Inactive
        // - timer >=1
        isInactive: function () {
            return this.timer >= 1;
        },

        // Unjammed
        isUnjammed: function () {
            return !(this.jammed);
        },

        // Has at least one Augmentable Activation Skill
        // - strike, protect, enfeeble, rally, repair, supply, siege, heal, weaken (unless they have on play/death/attacked/kill)
        hasSkill: function (s) {
            var target_skills = this.skill;
            for (var key in target_skills) {
                var skill = target_skills[key];
                if (skill.id === s) {
                    return true;
                }
            }
            return false;
        },

        // Damaged
        // -.health_left < health
        isDamaged: function () {
            if (this.health_left < this.health) return true;
            return false;
        },

        // Has Attack power
        // - attack > 0
        hasAttack: function () {
            return (this.adjustedAttack() > 0);
        },

        adjustedAttack: function () {
            return ((this.attack + this.attack_rally - this.attack_weaken));
        },

        // Targets that are opposite of the source or to the right of it
        // - only use this function for Chaos on Death, Jam on Death, and Weaken on Death
        hasNotAttackedAlready2: function (relative_source) {
            if (!relative_source.isAssault()) return true; // If source is not an assault, assume that the target has not attacked already
            return (this.key >= relative_source.key); // If source is an assault, check its relative position
        },

        // Targets that are opposite of the source or to the right of it
        // - only use this function for Chaos on Attacked, Jam on Attacked, and Weaken on Attacked
        hasNotAttackedAlready3: function (attacker) {
            if (!attacker.isAssault()) return true; // If source is not an assault, assume that the target has not attacked already
            return (this.key > attacker.key); // If source is an assault, check its relative position
        },

        // Currently attacking
        // - only use this function for Chaos on Death, Jam on Death, and Weaken on Death
        isAttacking2: function (relative_source) {
            if (!relative_source.isAssault()) return false; // If source is not an assault, assume that the target is not attacking
            return (this.key == relative_source.key);
        },

        isAdjacent: function (src) {
            var thisKey = this.key;
            var left = src.key - 1;
            var right = left + 2;

            return (thisKey >= left && thisKey <= right);
        },

        // Filters by faction
        isInFaction: function (faction) {
            if (faction === undefined) return 1;
            if (this.type == faction) return 1;
            if (this.sub_type == faction) return 1;
            return 0;
        },
    }

    return (function (original_card, unit_level) {
        if (!unit_level) unit_level = 1;

        var card
        if (original_card) {
            var cached = card_cache[original_card.id + "-" + unit_level]
            if (cached) {
                card = cloneCard(cached);
            }
        }
        if (!card) {
            card = new Card(original_card, unit_level);
        }
        return card;
    })
}());

var MakeBattleground = (function () {
    var Battleground = function (name, skill) {
        this.name = name;
        this.skill = skill;
    }

    Battleground.prototype = {
        p: null,
        name: null,
        skill: null,

        //Card ID is ...
        isCommander: function () {
            return false;
        },

        isAssault: function () {
            return false;
        },

        isBattleground: function () {
            return true;
        },
    }

    return (function (name, skill) {
        return new Battleground(name, skill);
    })
}());

function copy_skills(original_skills) {
    var new_skills = {};
    var reusable = true;
    for (var key in original_skills) {
        var newSkill = original_skills[key];
        if (newSkill.c) {   // If skill has a timer, we need to clone it
            setSkill(new_skills, key, copy_skill(newSkill));
            reusable = false;
        } else {            // If skill has no timer, we can use the same instance
            setSkill(new_skills, key, newSkill);
        }
    }
    return [new_skills, reusable];
}

function update_skills(current_skills, upgrades) {
    for (var key in upgrades) {
        var name = upgrades[key].id;
        for (var key2 in current_skills) {
            var current_skill = current_skills[key2];
            if (current_skill && current_skill.id == name) delete current_skills[key2];
        }
    }
    for (var key in upgrades) {
        setSkill(current_skills, key, copy_skill(upgrades[key]));
    }
    return current_skills;
}

function setSkill(current_skills, key, skill) {
    // These skills could have multiple instances
    switch (skill.id) {
        case 'protect':
        case 'strike':
        case 'rally':
        case 'enhance':
        case 'fervor':
        case 'jam':
        case 'heal':
        case 'enfeeble':
        case 'legion':
        case 'weaken':
            current_skills[key] = skill;
            break;
        default:
            current_skills[skill.id] = skill;
            break;
    }
}

function copy_skill(original_skill) {
    var new_skill = {};
    new_skill.id = original_skill.id;
    new_skill.x = original_skill.x;
    new_skill.mult = original_skill.mult;
    new_skill.all = original_skill.all;
    new_skill.y = original_skill.y;
    new_skill.z = original_skill.z;
    new_skill.c = original_skill.c;
    new_skill.s = original_skill.s;
    new_skill.attacked = original_skill.attacked;
    new_skill.died = original_skill.died;
    new_skill.played = original_skill.played;
    new_skill.kill = original_skill.kill;
    return new_skill;
}

//Debug functions

//return skills in readable format
function debug_skills(skills) {
    var first_skill = true;
    var output = '';
    for (var key in skills) {
        var skill = skills[key];
        if (first_skill) output += ' <u>( ';
        else output += ' | ';
        first_skill = false;
        output += convertName(skill.id);
        if (skill.all) output += ' all';
        if (skill.y) output += ' ' + factions.names[skill.y];
        if (skill.s) output += ' ' + skill.s;
        if (skill.c) output += ' every ' + skill.c + ' turns';
        else if (skill.x) output += ' ' + skill.x;
    }
    if (!first_skill) output += ' )</u>';

    return output;
}

function convertName(oldName) {
    switch (oldName) {
        case "rally":
            return "empower";
        case "protect":
            return "barrier";
        case "enfeeble":
            return "hex";
        case "jam":
            return "freeze";
        case "evade":
            return "invisibility";
        case "counter":
            return "vengeance";
        case "strike":
            return "bolt";
        case "flurry":
            return "dualstrike";
        case "leech":
            return "siphon";
        default:
            return oldName;
    }
}

// Dump deck contents
function debug_dump_decks() {
    //	if (!debug) return;

    echo += '<br><hr><br>';
    echo += '<b>Deck Hash:</b>';
    echo += '<br>';
    echo += '<input type="text" value="';
    echo += hash_encode(cache_player_deck);
    echo += '" onclick="this.select()" size="100">';
    echo += '<br><br>';
    echo += '<b>Card List:</b>';
    echo += '<br>';
    echo += '<input type="text" value="';
    echo += generate_card_list(cache_player_deck);
    echo += '" onclick="this.select()" size="100">';
    echo += '<br><br>';
    var current_card = get_card_by_id(cache_player_deck.commander);
    current_card.owner = 'player';
    current_card.health_left = current_card.health;
    echo += debug_name(current_card) + debug_skills(current_card.skill) + '<br>';

    debug_dump_cards(cache_player_deck, 'player');

    var debug_cpu_deck;
    if (cache_cpu_deck) {
        debug_cpu_deck = cache_cpu_deck;
    }

    echo += '<br>';
    echo += '<br>';
    echo += '<i>Deck Hash:</i>';
    echo += '<br>';
    echo += '<input type="text" value="';
    echo += hash_encode(debug_cpu_deck);
    echo += '" onclick="this.select()" size="100">';
    echo += '<br>';
    echo += '<u>Please note that Raid and Quest simulations randomize the enemy deck for each battle. Only one example enemy deck hash is generated.</u><br>';
    echo += '<br>';
    echo += '<i>Card List:</i>';
    echo += '<br>';
    echo += '<input type="text" value="';
    echo += generate_card_list(debug_cpu_deck);
    echo += '" onclick="this.select()" size="100">';
    echo += '<br>';
    echo += '<u>Please note that Raid and Quest simulations randomize the enemy deck for each battle. Only one example enemy deck hash is generated.</u><br>';
    echo += '<br>';
    var current_card = get_card_by_id(debug_cpu_deck.commander);
    current_card.owner = 'cpu';
    current_card.health_left = current_card.health;
    echo += debug_name(current_card) + debug_skills(current_card.skill) + '<br>';
    debug_dump_cards(debug_cpu_deck, 'cpu');
    echo += '<br><hr><br>';
}

function debug_dump_cards(deck, player) {
    for (var key in deck.deck) {
        // Get cardID
        var card_id = deck.deck[key];
        if (isNaN(card_id) && card_id.indexOf(',') != -1) {
            card_id = card_id.split(',');
            card_id = card_id[0];
        }
        // Setup card for printing
        current_card = get_card_by_id(card_id);
        current_card.owner = player;
        current_card.key = undefined;
        // Echo card info
        echo += debug_name(current_card) + debug_skills(current_card.skill);
        if (current_card.type) echo += ' <u>' + factions.names[current_card.type] + '</u>';
        if (current_card.sub_type) echo += ' <u>' + factions.names[current_card.sub_type] + '</u>';
        echo += '<br>';
    }
}

// Dump field contents
function debug_dump_field() {
    if (!debug) return;

    echo += '<font color="#666666">';

    var players = ['player', 'cpu'];

    for (var player_key = 0, p_len = players.length; player_key < p_len; player_key++) {
        var player_val = players[player_key];
        echo += '<br>';
        echo += player_val + '\'s assaults:<br>';
        var field_x_units = field[player_val].assaults;
        for (var card_key = 0, unit_len = field_x_units.length; card_key < unit_len; card_key++) {
            var current_card = field_x_units[card_key];
            echo += debug_name(current_card);
            echo += '(' + key + ')';
            echo += '<br>';
        }
        if (!field[player_val].assaults.length) echo += 'None<br>';
    }
    echo += '</font>';
    echo += '<br>';
}

// Output formatted name of card
function debug_name(card, hideStats) {
    if (card.owner == 'cpu') {
        var tag = 'i';
    } else {
        var tag = 'b';
    }
    var output = '<' + tag + '>';
    output += card.name;
    if (card.maxLevel > 1) output += '{' + card.level + '/' + card.maxLevel + '}';
    if (card.key !== undefined) output += ' (' + card.key + ')';
    output += '</' + tag + '>';
    if (!hideStats) {
        output += '<u>';
        if (card.isCommander()) {
            output += ' [';
            if (card.health_left !== undefined) output += card.health_left;
            else output += card.health;
            output += ' HP]';
        } else if (card.isAssault()) {
            output += ' [';
            var atk = parseInt(card.attack) + parseInt(card.attack_rally) - parseInt(card.attack_weaken);
            if (isNaN(atk) || atk == undefined) atk = card.attack;
            output += atk;
            output += '/';
            if (card.health_left !== undefined) output += card.health_left;
            else output += card.health;
            output += '/';
            if (card.timer !== undefined) output += card.timer;
            else output += card.cost;
            output += ']';
        }
        output += '</u>';
    }

    return output;
}

// Dump whatever card or array
function dump(card) {
    echo += '<pre>';
    print_r(card);
    echo += '</pre>';
}

//Returns written card list built from deck array
function generate_card_list(deck) {

    var cardlist = [];
    var copies = [];
    var priorities = [];

    var commander = get_slim_card_by_id(deck.commander);
    cardlist.push(commander.name + "(" + commander.level + ")");
    copies.push(1);
    priorities.push(0);
    var lastidx = 0;
    for (var key in deck.deck) {
        var card = deck.deck[key];
        var priority = 0;
        if (isNaN(card) && card.indexOf(',') != -1) {
            card = card.split(',');
            priority = parseInt(card[1]);
            card = card[0];
        }
        card = get_slim_card_by_id(card);

        if (!card) continue;

        var card_name = card.name + "(" + card.level + ")";

        if (cardlist[lastidx] == card_name) {
            copies[lastidx]++;
        } else {
            cardlist.push(card_name);
            copies.push(1);
            priorities.push(priority);
            lastidx++;
        }
    }

    for (var i = copies.length - 1; i >= 0; i--) {
        var numCopies = copies[i];
        var priority = priorities[i];
        if (numCopies > 1) {
            cardlist[i] += "x" + numCopies;
        }
        if (priority > 0) {
            cardlist[i] += "=" + priority;
        }
    }

    cardlist = cardlist.join("; ");

    return cardlist;
}

var base64chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!~-";
var multiplierChars = "_*.'";

function base64triplet_to_decimal(triplet) {

    if (triplet.length != 3) return false;

    var dec1 = base64chars.indexOf(triplet[0]);
    var level = (dec1 % 7) + 1;
    dec1 = Math.floor(dec1 / 7);
    var fusion = (dec1 % 3) * 10000;
    dec1 = Math.floor(dec1 / 3) * 4096;

    var dec2 = base64chars.indexOf(triplet[1]) * 64;
    var dec3 = base64chars.indexOf(triplet[2]);

    var id = (fusion + dec1 + dec2 + dec3) + "(" + level + ")";
    return id;
}

function decimal_to_base64triplet(decimal) {

    var id_parts = get_id_parts(decimal);
    var baseID = parseInt(id_parts[0]);
    var level = (parseInt(id_parts[1]) - 1);

    var fusion = Math.floor(baseID / 10000);
    baseID %= 10000;

    var char1 = base64chars[(Math.floor(baseID / 4096) * 3 + fusion) * 7 + level];
    baseID %= 4096;

    var char2 = base64chars[Math.floor(baseID / 64)];
    var char3 = base64chars[baseID % 64];

    return char1 + char2 + char3;
}

function encode_multiplier(copies) {
    copies = copies - 2;    // Encoded as "2 + value"
    if(copies > 256) {
        return "";
    }
    var char1 = multiplierChars[Math.floor(copies/64)];
    var char2 = base64chars[copies % 64];
    return char1 + char2;
}

function decode_multiplier(encoded) {
    var dec1 = multiplierChars.indexOf(encoded[0]) * 64;
    var dec2 = base64chars.indexOf(encoded[1]);
    return dec1 + dec2;
}


//Returns hash built from deck array
function hash_encode(deck) {

    var current_hash = [];
    var has_priorities = false;

    if (deck.commander) {
        current_hash.push(decimal_to_base64triplet(deck.commander));
    }
    var copies = [1];
    var lastIndex = 0;
    for (var k in deck.deck) {
        var current_card = deck.deck[k];
        if (isNaN(current_card) && current_card.indexOf(',') != -1) {
            has_priorities = true;
            current_card = current_card.split(',');
            current_card = current_card[0];
        }
        var triplet = decimal_to_base64triplet(current_card);
        if (triplet == current_hash[lastIndex]) {
            copies[lastIndex]++;
        } else {
            current_hash.push(triplet);
            copies.push(1);
            lastIndex++;
        }
    }
    /*
    if (has_priorities) {
        current_hash += '|';
        for (var k in deck.deck) {
            var current_card = deck.deck[k];
            if (isNaN(current_card) && current_card.indexOf(',') != -1) {
                var current_priority = current_card.split(',');
                current_priority = parseInt(current_priority[1]);
                current_hash += '' + current_priority;
            } else {
                current_hash += '0';
            }
        }
    }
    */
    for (var i = 0; i < copies.length; i++) {
        var num = copies[i];
        if (num > 1) {
            current_hash[i] += encode_multiplier(num);
        }
    }
    current_hash = current_hash.join("");

    return current_hash;
}

//Returns deck array built from hash
function hash_decode(hash) {

    var current_deck = [];
    current_deck.deck = [];
    var current_id;
    for (var i = 0; i < hash.length; i += 3) {
        if (multiplierChars.indexOf(hash[i]) == -1) {
            // Make sure we have valid characters
            current_id = base64triplet_to_decimal(hash.substr(i, 3));

            if (current_id) {
                var id = get_id_parts(current_id)[0];
                if (CARDS.root.unit[id]) {
                    // Repeat previous card multiple times
                    if (is_commander(id)) {
                        current_deck.commander = current_id;
                        // Add to deck
                    } else {
                        current_deck.deck.push(current_id);
                    }
                }
            }
        } else {
            var multiplier = decode_multiplier(hash.substr(i, 2)) + 1;
            for (var n = 0; n < multiplier; n++) {
                current_deck.deck.push(current_id);
            }
            i -= 1; // Offset i so that the += 3 in the loop sets it to the correct next index
        }
    }

    // Default commander to Elaria Captain if none found
    if (!current_deck.commander) {
        current_deck.commander = "202";
    }

    return current_deck;
}

// Convert card list into an actual deck
// - assume that first card is always commander
// - possible delimiters include ; , :
// - sometimes name is not complete
// - include common abbreviations, such as EMP, BoD, EQG, etc.
// - case-insensitive
// - recognize multiple copies of cards
// - if can't figure out what card it is, ignore it and move on
// - support raid-only and mission-only cards by using Dracorex[1042] notation
function load_deck_from_cardlist(list) {

    var current_deck = [];
    current_deck.deck = [];

    if (list) {
        //var delimiters = ';,:';
        var abbreviations = [];
        // Safety mechanism to prevent long loops
        if (list.length > 300) list = list.substr(0, 300);

        list = list.toString().toLowerCase();
        list = list.replace(/[\&\/\.\!\?\'-]/g, ''); // Replace random punctuation characters
        list = list.replace(/\s/g, '');              // Remove all whitespace
        list = list.split(/[,;:]/);

        var unit_definitions = CARDS.root.unit;

        for (var i in list) {
            var current_card = list[i].toString();
            var unit_id = 0;
            var unit_level = '(7)'; // Default all cards to max leve if none is specified
            var card_found = false;
            var current_card_upgraded = false;

            // Detect advanced prioritization
            var priority_id = 0;
            if (current_card.toString().length > 3 && current_card.toString().match(/=[1-9][0-9]*$/)) {
                priority_id = parseInt(current_card.substr(current_card.length - 1, 1));
                current_card = current_card.substr(0, current_card.length - 2);
            }

            var copies = 1;
            // Detect multiple copies
            var match;
            // Look for Nx at the beginning of the card name
            if (match = current_card.toString().match(/^[1-9]+x/)) {
                copies = parseInt(match[0]);
                current_card = current_card.substr(match[0].length);
                // Look for Nx at the end of the card name
            } else if (match = current_card.toString().match(/x[1-9]+$/)) {
                copies = parseInt(match[0].substr(1));
                current_card = current_card.substr(0, current_card.length - match[0].length);
            }

            // Look for (N) at the end to denote level
            if (match = current_card.toString().match(/\([1-9]+\)$/)) {
                unit_level = match[0];
                current_card = current_card.substr(0, current_card.length - match[0].length);
            }

            current_card = current_card.trim();

            // Use unit_id notation if available
            if (match = current_card.toString().match(/\[[1-9]+\]/)) {
                unit_id = match[0];
                if (unit_level) unit_id += unit_level;
                if (is_commander(unit_id)) {
                    current_deck.commander = unit_id;
                } else {
                    while (copies > 0) {
                        current_deck.deck.push(unit_id);
                        copies--;
                    }
                }
                continue;
            }

            // Use abbreviation if available
            current_card = clean_name_for_matching(current_card);
            if (abbreviations[current_card]) current_card = abbreviations[current_card];
            current_card = clean_name_for_matching(current_card);

            // Match full name if available
            for (var k in unit_definitions) {
                var card = unit_definitions[k];
                unit_id = card.id;
                var current_name = clean_name_for_matching(card.name);

                if (current_name == current_card) {
                    var fullID = unit_id + unit_level;
                    if (is_commander(unit_id) && copies == 1) {
                        current_deck.commander = fullID;
                    } else {
                        if (priority_id > 0) {
                            fullID += ',' + priority_id;
                        }
                        current_deck.deck.push(fullID);
                        while (copies > 1) {
                            current_deck.deck.push(fullID);
                            copies--;
                        }
                    }
                    card_found = true;
                    break;
                }
            }
            if (card_found) continue;

            // If no commanders yet, match partial name to commanders if available
            if (!current_deck.commander && copies == 1) {
                for (var k in unit_definitions) {
                    var card = unit_definitions[k];
                    unit_id = card.id;
                    if (!is_commander(unit_id)) continue;
                    var current_name = clean_name_for_matching(card.name);
                    if (current_name.indexOf(current_card) != -1) {
                        current_deck.commander = unit_id + unit_level;
                        card_found = true;
                        break;
                    }
                }
            }
            if (card_found) continue;

            // Match partial name to non-commanders if available
            for (var k in unit_definitions) {
                var card = unit_definitions[k];
                unit_id = card.id;
                if (is_commander(unit_id)) continue;
                var current_name = clean_name_for_matching(card.name);
                if (current_name.indexOf(current_card) != -1) {
                    var fullID = unit_id + unit_level + ((priority_id > 0) ? ',' + priority_id : '');
                    current_deck.deck.push(fullID);
                    while (copies > 1) {
                        current_deck.deck.push(fullID);
                        copies--;
                    }
                    card_found = true;
                    break;
                }
            }
            if (card_found) continue;
        }
    }

    // Default commander to Elaria Captain if none found
    if (!current_deck.commander) {
        current_deck.commander = "202";
    }

    return current_deck;
}

function clean_name_for_matching(name) {
    name = name.toLowerCase();
    name = name.toString().replace(/[\&]/g, ',');
    name = name.toString().replace(/[\.\!\?]/g, '');
    name = name.toString().replace(/\s/g, '');
    name = name.toString().replace(/-/g, '');
    name = name.toString().replace(/\'/g, '');
    return name;
}

function add_to_deck(card) {

}

// Load mission deck
function load_deck_mission(id) {

    var missionInfo = missions.root.mission[id];
    if (!missionInfo) return 0;

    var current_deck = [];
    current_deck.deck = [];
    current_deck.commander = missionInfo.commander + "(6)";   // Set commander to max level
    var missionDeck = missionInfo.deck;
    for (var current_key in missionDeck) {
        var current_card = missionDeck[current_key];
        // Upgrade all cards to max fusion/level
        if (current_card.length > 4) {
            current_card[0] = '2';
        } else {
            current_card = '2' + current_card;
        }
        current_deck.deck.push(current_card + "(6)");
    }
    return current_deck;
}

// Load raid deck
// - randomize it as required
function load_deck_raid(id) {

    var raid = raids.root.raid[id];
    if (!raid) return 0;

    // Load battleground, if available
    if (raid.effect && !getbattleground) {
        battleground = quests.root.battleground[raid.effect.effect];
        getbattleground = raid.effect;
    }

    var current_deck = [];
    current_deck.deck = [];
    current_deck.commander = raid.commander;

    // Always included raid cards
    var current_pool = raid.deck.always_include;
    if (current_pool && current_pool.card) {
        current_pool = current_pool.card;
        for (var current_key in current_pool) {
            var current_card = current_pool[current_key];
            current_deck.deck.push(current_card);
        }
    }

    // Variable Card Pools
    var parent_pool = raid.deck.card_pool;
    if (parent_pool) {
        for (var pool_key in parent_pool) {
            current_pool = parent_pool[pool_key];
            if (current_pool && current_pool.card) {
                var amount = current_pool.amount;
                var current_pool_cards = copy_card_list(current_pool.card);
                shuffle(current_pool_cards);
                for (var current_key in current_pool_cards) {
                    if (amount < 1) break;
                    var current_card = current_pool_cards[current_key];
                    current_deck.deck.push(current_card);
                    amount--;
                }
            }
        }
    }
    return current_deck;
}


// Output card array
function get_card_by_id(id, unit_level) {

    if (typeof unit_level === 'undefined') {
        unit_level = 99;
        var parts = get_id_parts(id);
        id = parts[0];
        unit_level = parts[1];
    }

    var current_card = CARDS.root.unit[id];

    // Not a valid card
    if (!current_card) {
        current_card = {};
        current_card.id = undefined;
        current_card.name = undefined;
        current_card.health = undefined;
        current_card.skill = [];
        return current_card;
    } else {
    {
        // Add empty skill array to prevent skill condition-checking errors
        if (!current_card.skill) {
            current_card.skill = [];
        }
        return MakeAssault(current_card, unit_level);
    }
}

function get_id_parts(id) {
    var level = "7";
    if (isNaN(id)) {
        var match = id.match(/\(([1-9]+)\).*/);
        if (match) {
            level = match[1];
            id = id.substr(0, id.length - match[0].length);
        }
    }
    return [id, level];
}

function get_slim_card_by_id(id, getSkills) {

    var unit_level = 0;
    var levelStart = 0;
    if (isNaN(id)) {
        levelStart = id.indexOf('(');
        if (levelStart != -1 && id.indexOf(')') != -1) {
            unit_level = id.substr(levelStart);
            unit_level = unit_level.substr(0, unit_level.indexOf(')') + 1);
            id = id.substr(0, levelStart)
        }
    }

    var current_card = CARDS.root.unit[id];
    var new_card = [];
    // Not a valid card
    if (!current_card) {
        new_card.id = undefined;
        new_card.name = undefined;
        new_card.set = undefined;
        new_card.card_type = undefined;
        new_card.type = undefined;
        new_card.sub_type = undefined;
        new_card.rarity = undefined;
        new_card.level = undefined;
        new_card.maxLevel = undefined;
        if (getSkills) new_card.skill = [];
    } else {
        new_card.id = current_card.id;
        new_card.name = current_card.name;
        new_card.set = current_card.set;
        new_card.card_type = current_card.card_type;
        new_card.type = current_card.type;
        new_card.sub_type = current_card.sub_type;
        new_card.maxLevel = GetMaxLevel(current_card);
        if (unit_level) {
            new_card.level = unit_level.replace(/[\(\)]/g, '');
            if (new_card.level > new_card.maxLevel) new_card.level = new_card.maxLevel;
        } else new_card.level = 1;
        if (getSkills) {
            new_card.skill = current_card.skill;
            if (new_card.level > 1) {
                for (var key in current_card.upgrades) {
                    var upgrade = current_card.upgrades[key];
                    update_skills(this.skill, upgrade.skill);
                    if (key == new_card.level) break;
                }
            }
        }
    }
    return new_card;
}

function GetMaxLevel(original_card) {
    if (original_card.maxLevel) return original_card.maxLevel;
    original_card.maxLevel = 1;
    var upgrades = original_card.upgrades;
    if (upgrades) for (key in upgrades) {
        if (upgrades.hasOwnProperty(key)) original_card.maxLevel++;
    }
    return original_card.maxLevel;
}

// Output card name
function get_card_name_by_id(id) {
    var card = CARDS.root.unit[id];
    if (!card) return 0;
    else if (card.set == 5002) return card.name + '*';
    else return card.name;
}


//Card ID is ...
function is_commander(id) {
    var card = CARDS.root.unit[id];
    return (card && card.card_type == '1');
}