<Query Kind="Program">
  <Reference>&lt;RuntimeDirectory&gt;\System.XML.dll</Reference>
  <Namespace>System.Xml.Serialization</Namespace>
</Query>

static bool downloadFiles = true;

static string path = Path.GetDirectoryName(Util.CurrentQueryPath);
static string baseUrl = @"https://spellstone.synapse-games.com/assets";


static System.Net.WebClient webClient = new System.Net.WebClient();
static HashSet<string> g_unitIDs;


static System.Xml.Serialization.XmlSerializer unitDeserializer = new System.Xml.Serialization.XmlSerializer(typeof(unit));
static System.Xml.Serialization.XmlSerializer bgeDeserializer = new System.Xml.Serialization.XmlSerializer(typeof(battleground));

void Main()
{
	var xmlFile = Path.Combine(path, "cards.xml");
	var doc = XDocument.Load(xmlFile);

	HashSet<string> existingUnits = LoadUnits(doc);
	HashSet<string> newUnits = new HashSet<string>();

	Normalize("achievements.xml", downloadFiles);
	Normalize("battleground_effects.xml", downloadFiles);
	Normalize("campaigns.xml", downloadFiles);
	Normalize("cards.xml", downloadFiles);
	Normalize("fusion_recipes_cj2.xml", downloadFiles);
	Normalize("levels.xml", downloadFiles);
	Normalize("missions.xml", downloadFiles);
	Normalize("missions_event.xml", downloadFiles);
	Normalize("passive_missions.xml", downloadFiles);

	g_unitIDs = new HashSet<string>();
	xmlFile = Path.Combine(path, "cards.xml");
	doc = XDocument.Load(xmlFile);

	StringBuilder sbJSON = new StringBuilder();
	List<unit> units = new List<unit>();

	var pictures = new Dictionary<string, string>();
	var noImage = new List<string>();
	var notFound = new Dictionary<string, string>();

	var unitNodes = doc.Descendants("unit");
	foreach (var unitXML in unitNodes)
	{
		var stringReader = new StringReader(unitXML.ToString());
		var unit = (unit)unitDeserializer.Deserialize(stringReader);
		units.Add(unit);
		if (!existingUnits.Contains(unit.id))
		{
			newUnits.Add(unit.id);
			unit.picture.Dump("New Image");
		}
		if (unit.portrait != null)
		{
			pictures[unit.portrait] = unit.name;
			var imageFile = Path.Combine(path, @"..\res\cardImages\", unit.picture + ".png");
			if (!File.Exists(imageFile))
			{
				notFound[unit.picture] = unit.asset_bundle;
				unit.picture = "NotFound";
			}
		}
		else if (unit.picture != null)
		{
			pictures[unit.picture] = unit.name;
			var imageFile = Path.Combine(path, @"..\res\cardImages\", unit.picture + ".jpg");
			if (!File.Exists(imageFile))
			{
				notFound[unit.picture] = unit.asset_bundle;
				unit.picture = "NotFound";
			}
		}
		else
		{
			noImage.Add(unit.name + "(NO IMAGE)");
		}
	}

	notFound.Dump("Missing these");

	// Add placeholder units for unused images
	var unusedImages = new DirectoryInfo(Path.Combine(path, @"..\res\cardImages"))
		.GetFiles("New*A.jpg")
		.Select(imageFile => imageFile.Name);
	var idPrefixes = new[] { "", "1", "2" };
	var imageSuffixes = new[] { "A", "A", "B" };
	var nameSuffixes = new[] { "S", "D", "Q" };
	var unitID = 10000 - unusedImages.Count();
	foreach (var image in unusedImages)
	{
		var imageName = image.Split('_')[0];
		var imageNumber = imageName.Replace("New", "");
		for (var i = 0; i < 3; i++)
		{
			var unit = new unit()
			{
				id = idPrefixes[i] + unitID.ToString(),
				name = "",//"New " + imageNumber + " (" + nameSuffixes[i] + ")",
				picture = imageName + "_" + imageSuffixes[i],
				rarity = "0",
				card_type = "2",
				type = "0",
				attack = "-1",
				health = "-1",
				cost = "-1",
			};
			units.Add(unit);
			// Only add these to spoilers if there are other new units - don't want to overwrite spoilers with just new art
			if (newUnits.Count > 0 && i != 1)
			{
				newUnits.Add(unit.id);
			}
		}
		unitID++;
	}

	if (newUnits.Count > 0)
	{
		var spoilers = "var spoilers = {};\r\n" + String.Join("\r\n", newUnits.Select(id => String.Format("spoilers[{0}] = true;", id)));
		newUnits.Dump("New Units:");
		File.WriteAllText(Path.Combine(path, "../scripts/data", "spoilers.js"), spoilers);
	}

	// Get Locations
	var locations = XDocument.Load(Path.Combine(path, "missions.xml")).Descendants("location")
	.Select(node => new
	{
		id = node.Element("id").Value,
		name = node.Element("name").Value
	}).OrderBy(location => location.id)
	.Concat(new[] {
		new {
			id = "0",
			name = "Hero Upgrades"
		}
	});

	// Get Campaigns
	var campaigns = XDocument.Load(Path.Combine(path, "campaigns.xml")).Descendants("campaign")
	.Select(node => new campaign()
	{
		id = node.Element("id").Value,
		name = node.Element("name").Value,
		location_id = node.Element("location_id").Value,
		side_mission = (string)node.Element("side_mission"),
		missions = node.Element("missions").Elements("mission_id").Select(mission_id => Int32.Parse(mission_id.Value)).ToArray()
	}).OrderBy(campaign => campaign.location_id).ThenBy(campaign => campaign.id);

	// Get Missions
	var missions = XDocument.Load(Path.Combine(path, "missions.xml")).Descendants("mission")
	.Union(XDocument.Load(Path.Combine(path, "missions_event.xml")).Descendants("mission"))
	.Select(node => new mission()
	{
		id = node.Element("id").Value,
		name = node.Element("name").Value,
		commander = node.Elements("commander").Select(card => new missionCard()
		{
			id = card.Attribute("id").Value,
			level = (string)card.Attribute("level"),
		}).FirstOrDefault(),
		deck = node.Element("deck").Elements("card").Select(card => new missionCard()
		{
			id = card.Attribute("id").Value,
			level = (string)card.Attribute("level"),
			mastery_level = (string)card.Attribute("mastery_level"),
			remove_mastery_level = (string)card.Attribute("remove_mastery_level"),
		}).ToArray()
	}).OrderBy(mission => mission.id);
	
	// Get Fusions
	xmlFile = Path.Combine(path, "fusion_recipes_cj2.xml");
	doc = XDocument.Load(xmlFile);
	var fusions = doc.Descendants("fusion_recipe").Select(node => new fusionRecipe()
	{
		fusedCardID = node.Element("card_id").Value,
		baseCardID = node.Element("resource").Attribute("card_id").Value,
	}).OrderBy(f => f.baseCardID);

	var file = new FileInfo(Path.Combine(path, "../scripts/data", "cache.js"));
	using (var writer = file.CreateText())
	{
		writer.Write("var CARDS = {\r\n");
		foreach (var unit in units)
		{
			writer.Write(unit.ToString());
		}
		writer.Write("};\r\n");

		writer.Write("var LOCATIONS = {\r\n");
		foreach (var location in locations)
		{
			writer.WriteLine("  \"" + location.id + "\": {");
			writer.WriteLine("    \"id\": \"" + location.id + "\",");
			writer.WriteLine("    \"name\": \"" + location.name + "\",");
			writer.WriteLine("  },");
		}
		writer.Write("};\r\n");

		writer.Write("var CAMPAIGNS = {\r\n");
		foreach (var campaign in campaigns)
		{
			writer.WriteLine("  \"" + campaign.id + "\": {");
			writer.WriteLine("    \"id\": \"" + campaign.id + "\",");
			writer.WriteLine("    \"name\": \"" + campaign.name + "\",");
			writer.WriteLine("    \"location_id\": \"" + campaign.location_id + "\",");
			writer.WriteLine("    \"side_mission\": \"" + campaign.side_mission + "\",");
			writer.WriteLine("    \"missions\": [\"" + String.Join("\",\"", campaign.missions) + "\"]");
			writer.WriteLine("  },");
		}
		writer.Write("};\r\n");
		
		writer.WriteLine("var MISSIONS = {");
		foreach (var mission in missions)
		{
			writer.WriteLine("  \"" + mission.id + "\": {");
			writer.WriteLine("    \"id\": \"" + mission.id + "\",");
			writer.WriteLine("    \"name\": \"" + mission.name + "\",");
			writer.WriteLine("    \"commander\": {");
			writer.WriteLine(mission.commander.ToString());
			writer.WriteLine("    },");
			writer.WriteLine("    \"deck\": [");
			foreach (var card in mission.deck)
			{
				writer.WriteLine("      {");
				writer.WriteLine(card.ToString());
				writer.WriteLine("      },");
			}
			writer.WriteLine("    ]");
			writer.WriteLine("  },");
		}
		writer.WriteLine("};");

		writer.WriteLine("var FUSIONS = {");
		writer.WriteLine(String.Join(",\r\n", fusions.Select(f => f.ToString())));
		writer.WriteLine("};");

		writer.WriteLine("var ACHIEVEMENTS = [];");

		xmlFile = Path.Combine(path, "battleground_effects.xml");
		doc = XDocument.Load(xmlFile);

		var bgeNodes = doc.Descendants("battleground");
		var battlegrounds = new List<battleground>();
		foreach (var bgeXML in bgeNodes)
		{
			var stringReader = new StringReader(bgeXML.ToString());
			var bge = (battleground)bgeDeserializer.Deserialize(stringReader);
			// World Event BGEs
			if (Int32.Parse(bge.id) > 500)
			{
				bge.hidden = "true";
			}
			battlegrounds.Add(bge);
		}
		writer.WriteLine("var BATTLEGROUNDS = [");
		for (int i = 0; i < battlegrounds.Count; i++)
		{
			var battleground = battlegrounds[i];
			writer.Write(battleground.ToString());
		}
		writer.WriteLine("];");
	}
}

private HashSet<string> LoadUnits(XDocument doc)
{
	var existingUnits = new HashSet<string>();
	var unitNodes = doc.Descendants("unit");
	foreach (var unitXML in unitNodes)
	{
		var stringReader = new StringReader(unitXML.ToString());
		var unit = (unit)unitDeserializer.Deserialize(stringReader);
		existingUnits.Add(unit.id);
	}
	return existingUnits;
}

public enum FactionIDs
{
	Aether = 1,
	Chaos = 2,
	Wyld = 3,
	Frog = 4,
	Elemental = 5,
	Angel = 6,
	Undead = 7,
	Void = 8,
	Dragon = 9,
	Avian = 10,
	Goblin = 11,
	Seafolk = 12,
	Insect = 13,
}

public class battleground
{
	private const string tabs = "    ";
	private const string tabs2 = "      ";
	private const string tabs3 = "        ";
	private const string tabs4 = "        ";

	public string name { get; set; }

	[XmlArrayItem(Type = typeof(add_skill), ElementName = "add_skill")]
	[XmlArrayItem(Type = typeof(evolve_skill), ElementName = "evolve_skill")]
	[XmlArrayItem(Type = typeof(skill), ElementName = "skill")]
	public battlegroundEffect[] effect { get; set; }
	public string id { get; set; }
	public string desc { get; set; }
	public string enemy_only { get; set; }
	public string scale_with_level { get; set; }
	public string starting_level { get; set; }
	public string hidden { get; set; }

	public override string ToString()
	{
		StringBuilder sb = new StringBuilder();
		sb.Append("  {\r\n");
		sb.Append(tabs).Append("\"name\": \"").Append(name).Append("\",\r\n");
		sb.Append(tabs).Append("\"id\": \"").Append(id).Append("\",\r\n");
		if (enemy_only != null) sb.Append(tabs).Append("\"enemy_only\": \"").Append(enemy_only).Append("\",\r\n");
		if (scale_with_level != null) sb.Append(tabs).Append("\"scale_with_level\": \"").Append(scale_with_level).Append("\",\r\n");
		if (starting_level != null) sb.Append(tabs).Append("\"starting_level\": \"").Append(starting_level).Append("\",\r\n");
		if (hidden != null) sb.Append(tabs).Append("\"hidden\": \"").Append(hidden).Append("\",\r\n");
		sb.Append(tabs).Append("\"effect\": [\r\n");
		//sb.Append(tabs2).Append("\"" + effect.GetType().Name.Replace("[]", "") + "\": [\r\n");
		AppendEffect(sb);
		//sb.Append(tabs2).Append("]\r\n");
		sb.Append(tabs).Append("]\r\n");
		sb.Append("  },\r\n");
		return sb.ToString();
	}

	private void AppendEffect(StringBuilder sb)
	{
		for (int i = 0; i < effect.Length; i++)
		{
			sb.Append(tabs2).Append("{\r\n");
			var effect_i = effect[i];
			AppendEntryString(sb, "effect_type", effect_i.GetType().Name, tabs3);
			if (effect_i is skill)
			{
				AppendSkill(sb, (skill)effect_i, tabs3, false);
			}
			else if (effect_i is evolve_skill)
			{
				AppendEvolve(sb, (evolve_skill)effect_i, tabs3);
			}
			else if (effect_i is add_skill)
			{
				AppendAddSkill(sb, (add_skill)effect_i, tabs3);
			}
			sb.Append(tabs2).Append("},\r\n");
		}
	}
}

public abstract class CardType
{
	public static string Hero = "1";
	public static string Unit = "2";
}

/// <remarks/>
[System.Xml.Serialization.XmlTypeAttribute(AnonymousType = true)]
[System.Xml.Serialization.XmlRootAttribute(Namespace = "", IsNullable = false)]
public partial class unit
{
	const string unitTabs = "    ";
	const string upgradeTabs = "      ";
	const string skillUpgradeDefTabs = "          ";
	const string skillUpgradePropTabs = "        ";
	const string skillTabs = "      ";
	const string skillUpgradeTabs = "        ";

	public void AppendUnit(StringBuilder sb)
	{
		sb.Append("  \"").Append(id).Append("\": {\r\n");
		AppendEntryString(sb, "id", id, unitTabs);
		AppendEntryString(sb, "name", name, unitTabs);
		AppendEntryString(sb, "picture", picture, unitTabs);
		AppendEntryString(sb, "rarity", rarity, unitTabs);
		AppendEntryString(sb, "set", set, unitTabs);
		AppendEntryString(sb, "card_type", card_type, unitTabs);
		AppendEntryString(sb, "type", type, unitTabs);
		AppendEntryString(sb, "sub_type", sub_type, unitTabs);
		if (card_type != "1")
		{
			AppendEntry(sb, "attack", attack, unitTabs);
		}
		AppendEntry(sb, "health", health, unitTabs);
		AppendEntry(sb, "cost", cost, unitTabs);
		AppendSkills(sb, skills, unitTabs);
		AppendUpgrades(sb);
		sb.Append("  },\r\n");
	}

	public override string ToString()
	{
		StringBuilder unit = new StringBuilder();
		AppendUnit(unit);
		if (!g_unitIDs.Add(this.id))
		{
			"Conflict".Dump(this.id + " : " + this.name);
		}
		return unit.ToString();
	}

	private void AppendUpgrades(StringBuilder sb)
	{
		if (upgrades == null || upgrades.Length == 0)
		{
			sb.Append(unitTabs).Append("\"upgrades\": {}\r\n");
		}
		else
		{
			sb.Append(unitTabs).Append("\"upgrades\": {\r\n");
			foreach (var upgrade in upgrades)
			{
				sb.Append(upgradeTabs).Append("\"").Append(upgrade.level).Append("\": {\r\n");
				AppendEntry(sb, "attack", upgrade.attack, skillUpgradePropTabs);
				AppendEntry(sb, "health", upgrade.health, skillUpgradePropTabs);
				AppendEntry(sb, "cost", upgrade.cost, skillUpgradePropTabs);
				AppendSkills(sb, upgrade.skills, skillUpgradePropTabs);
				sb.Append(upgradeTabs).Append("},\r\n");
			}
			sb.Append(unitTabs).Append("}\r\n");
		}
	}

	private string idField;
	private string card_typeField;
	private string nameField;
	private string pictureField;
	private string portraitField;
	private string asset_prefabField;
	private string asset_bundleField;
	private string attackField;
	private string healthField;
	private string costField;
	private string rarityField;
	private string typeField;
	private string sub_typeField;
	private string setField;
	private skill[] skillsField;
	private unitUpgrade[] upgradesField;

	/// <remarks/>
	public string id
	{
		get { return this.idField; }
		set { this.idField = value; }
	}

	/// <remarks/>
	public string card_type
	{
		get { return this.card_typeField; }
		set { this.card_typeField = value; }
	}

	/// <remarks/>
	public string name
	{
		get { return this.nameField; }
		set { this.nameField = value; }
	}

	/// <remarks/>
	public string picture
	{
		get { return this.pictureField ?? this.portrait ?? this.asset_prefabField; }
		set { this.pictureField = value; }
	}

	public string asset_prefab
	{
		get { return this.asset_prefabField; }
		set { this.asset_prefabField = value; }
	}

	/// <remarks/>
	public string portrait
	{
		get
		{
			if (this.portraitField != null)
			{
				return "portrait_" + this.portraitField.ToLower().Replace("portrait_", "");
			}
			else
			{
				return null;
			}
		}
		set { this.portraitField = value; }
	}

	/// <remarks/>
	public string asset_bundle
	{
		get { return this.asset_bundleField; }
		set { this.asset_bundleField = value; }
	}

	/// <remarks/>
	public string attack
	{
		get { return this.attackField; }
		set { this.attackField = value; }
	}

	/// <remarks/>
	public string health
	{
		get { return this.healthField; }
		set { this.healthField = value; }
	}

	/// <remarks/>
	public string cost
	{
		get { return this.costField; }
		set { this.costField = value; }
	}

	/// <remarks/>
	public string rarity
	{
		get { return this.rarityField; }
		set { this.rarityField = value; }
	}

	/// <remarks/>
	[System.Xml.Serialization.XmlElementAttribute("skill")]
	public skill[] skills
	{
		get { return this.skillsField; }
		set { this.skillsField = value; }
	}

	/// <remarks/>
	public string type
	{
		get { return this.typeField; }
		set { this.typeField = value; }
	}

	/// <remarks/>
	public string sub_type
	{
		get { return this.sub_typeField; }
		set { this.sub_typeField = value; }
	}

	/// <remarks/>
	public string set
	{
		get { return this.setField; }
		set { this.setField = value; }
	}

	/// <remarks/>
	[System.Xml.Serialization.XmlElementAttribute("upgrade")]
	public unitUpgrade[] upgrades
	{
		get { return this.upgradesField; }
		set { this.upgradesField = value; }
	}
}
/// <remarks/>
[System.Xml.Serialization.XmlTypeAttribute(AnonymousType = true)]
public partial class unitUpgrade
{
	private string levelField;
	private string attackField;
	private string healthField;
	private string costField;
	private skill[] skillField;

	/// <remarks/>
	public string level
	{
		get { return this.levelField; }
		set { this.levelField = value; }
	}

	/// <remarks/>
	public string attack
	{
		get { return this.attackField; }
		set { this.attackField = value; }
	}

	/// <remarks/>
	public string health
	{
		get { return this.healthField; }
		set { this.healthField = value; }
	}

	/// <remarks/>
	public string cost
	{
		get { return this.costField; }
		set { this.costField = value; }
	}

	/// <remarks/>
	[System.Xml.Serialization.XmlElementAttribute("skill")]
	public skill[] skills
	{
		get { return this.skillField; }
		set { this.skillField = value; }
	}
}

/// <remarks/>
[System.Xml.Serialization.XmlTypeAttribute(AnonymousType = true)]
public partial class skill : battlegroundEffect
{
	private string idField;
	private string xField;
	private string yField;
	private string cField;
	private string sField;
	private string allField;
	private string multField;

	/// <remarks/>
	[System.Xml.Serialization.XmlAttributeAttribute()]
	public string id
	{
		get { return this.idField; }
		set { this.idField = value; }
	}

	/// <remarks/>
	[System.Xml.Serialization.XmlAttributeAttribute()]
	public string x
	{
		get { return this.xField; }
		set { this.xField = value; }
	}

	/// <remarks/>
	[System.Xml.Serialization.XmlAttributeAttribute()]
	public string mult
	{
		get { return this.multField; }
		set { this.multField = value; }
	}

	/// <remarks/>
	[System.Xml.Serialization.XmlAttributeAttribute()]
	public string y
	{
		get { return this.yField; }
		set { this.yField = value; }
	}

	/// <remarks/>
	[System.Xml.Serialization.XmlAttributeAttribute()]
	public string c
	{
		get { return this.cField; }
		set { this.cField = value; }
	}

	/// <remarks/>
	[System.Xml.Serialization.XmlAttributeAttribute()]
	public string s
	{
		get { return this.sField; }
		set { this.sField = value; }
	}

	/// <remarks/>
	[System.Xml.Serialization.XmlAttributeAttribute()]
	public string all
	{
		get { return this.allField; }
		set { this.allField = value; }
	}
}

/// <remarks/>
[System.Xml.Serialization.XmlTypeAttribute(AnonymousType = true)]
public partial class battlegroundEffect
{
}

/// <remarks/>
[System.Xml.Serialization.XmlTypeAttribute(AnonymousType = true)]
public partial class evolve_skill : battlegroundEffect
{
	private string idField;
	private string sField;
	private string allField;

	/// <remarks/>
	[System.Xml.Serialization.XmlAttributeAttribute()]
	public string id
	{
		get { return this.idField; }
		set { this.idField = value; }
	}

	/// <remarks/>
	[System.Xml.Serialization.XmlAttributeAttribute()]
	public string s
	{
		get { return this.sField; }
		set { this.sField = value; }
	}

	/// <remarks/>
	[System.Xml.Serialization.XmlAttributeAttribute()]
	public string all
	{
		get { return this.allField; }
		set { this.allField = value; }
	}
}

/// <remarks/>
[System.Xml.Serialization.XmlTypeAttribute(AnonymousType = true)]
public partial class add_skill : battlegroundEffect
{
	private string idField;
	private string xField;
	private string yField;
	private string cField;
	private string sField;
	private string allField;
	private string multField;
	private string baseField;

	/// <remarks/>
	[System.Xml.Serialization.XmlAttributeAttribute()]
	public string id
	{
		get { return this.idField; }
		set { this.idField = value; }
	}

	/// <remarks/>
	[System.Xml.Serialization.XmlAttributeAttribute()]
	public string x
	{
		get { return this.xField; }
		set { this.xField = value; }
	}

	/// <remarks/>
	[System.Xml.Serialization.XmlAttributeAttribute()]
	public string mult
	{
		get { return this.multField; }
		set { this.multField = value; }
	}

	/// <remarks/>
	[System.Xml.Serialization.XmlAttributeAttribute("base")]
	public string Base
	{
		get { return this.baseField; }
		set { this.baseField = value; }
	}

	/// <remarks/>
	[System.Xml.Serialization.XmlAttributeAttribute()]
	public string y
	{
		get { return this.yField; }
		set { this.yField = value; }
	}

	/// <remarks/>
	[System.Xml.Serialization.XmlAttributeAttribute()]
	public string c
	{
		get { return this.cField; }
		set { this.cField = value; }
	}

	/// <remarks/>
	[System.Xml.Serialization.XmlAttributeAttribute()]
	public string s
	{
		get { return this.sField; }
		set { this.sField = value; }
	}

	/// <remarks/>
	[System.Xml.Serialization.XmlAttributeAttribute()]
	public string all
	{
		get { return this.allField; }
		set { this.allField = value; }
	}
}

public partial class campaign
{
	public string id { get; set; }
	public string name { get; set; }
	public string location_id { get; set; }
	public string side_mission { get; set; }
	public int[] missions { get; set; }
}

public partial class mission
{
	public string id { get; set; }
	public string name { get; set; }
	public missionCard commander { get; set; }
	public missionCard[] deck { get; set; }
}

public partial class missionCard
{
	public string id { get; set; }
	public string level { get; set; }
	public string mastery_level { get; set; }
	public string remove_mastery_level { get; set; }

	public override string ToString()
	{
		var fields = new List<string>();
		var spaces = "        ";
		AddFieldIfSpecified(fields, "id", id, spaces);
		AddFieldIfSpecified(fields, "level", level, spaces);
		AddFieldIfSpecified(fields, "mastery_level", mastery_level, spaces);
		AddFieldIfSpecified(fields, "remove_mastery_level", remove_mastery_level, spaces);
		return String.Join(",\r\n", fields);
	}
}

private static void AddFieldIfSpecified(List<string> fields, string name, string value, string spaces)
{
	if (!String.IsNullOrWhiteSpace(value))
	{
		fields.Add(spaces + "\"" + name + "\": \"" + value + "\"");
	}
}

public partial class fusionRecipe
{
	public string baseCardID;
	public string fusedCardID;

	public override string ToString()
	{
		return "  \"" + baseCardID + "\" : \"" + fusedCardID + "\"";
	}
}

private static void AppendEntry(StringBuilder sb, string name, string value, string tabs)
{
	if (value != null)
	{
		sb.Append(tabs).Append("\"").Append(name).Append("\": ").Append(value).Append(",\r\n");
	}
}

private static void AppendEntryString(StringBuilder sb, string name, string value, string tabs)
{
	if (value != null)
	{
		sb.Append(tabs).Append("\"").Append(name).Append("\"").Append(": ").Append("\"").Append(value).Append("\",\r\n");
	}
}

private static void AppendSkills(StringBuilder sb, skill[] skills, string tabs)
{
	if (skills == null || skills.Length == 0)
	{
		//sb.Append(tabs).Append("\"skill\": {},\r\n");
		sb.Append(tabs).Append("\"skill\": [],\r\n");
	}
	else
	{
		string skillDefTabs = tabs + "  ";
		string skillPropTabs = skillDefTabs + "  ";
		//sb.Append(tabs).Append("\"skill\": {\r\n");
		sb.Append(tabs).Append("\"skill\": [\r\n");
		foreach (var skill in skills)
		{
			AppendSkill(sb, skill, skillDefTabs);
		}
		//sb.Append(tabs).Append("},\r\n");
		sb.Append(tabs).Append("],\r\n");
	}
}

private static void AppendSkill(StringBuilder sb, skill skill, string tabs, bool braces = true)
{
	var propTabs = tabs + (braces ? "  " : "");
	//sb.Append(tabs).Append("\"").Append(skill.id).Append("\": {\r\n");
	if (braces)
	{
		sb.Append(tabs).Append("{\r\n");
	}

	AppendEntryString(sb, "id", skill.id, propTabs);
	AppendEntry(sb, "x", skill.x, propTabs);
	AppendEntry(sb, "mult", skill.mult, propTabs);
	AppendEntryString(sb, "y", skill.y, propTabs);
	AppendEntry(sb, "z", skill.y, propTabs);
	AppendEntry(sb, "c", skill.c, propTabs);
	AppendEntryString(sb, "s", skill.s, propTabs);
	AppendEntryString(sb, "all", skill.all, propTabs);

	if (braces)
	{
		sb.Append(tabs).Append("},\r\n");
	}
}

private static void AppendEvolve(StringBuilder sb, evolve_skill evolve, string tabs)
{
	AppendEntryString(sb, "id", evolve.id, tabs);
	AppendEntryString(sb, "s", evolve.s, tabs);
	AppendEntryString(sb, "all", evolve.all, tabs);
}

private static void AppendAddSkill(StringBuilder sb, add_skill skill, string tabs)
{
	AppendEntryString(sb, "id", skill.id, tabs);
	AppendEntry(sb, "x", skill.x, tabs);
	AppendEntry(sb, "mult", skill.mult, tabs);
	AppendEntryString(sb, "base", skill.Base, tabs);
	AppendEntryString(sb, "y", skill.y, tabs);
	AppendEntry(sb, "z", skill.y, tabs);
	AppendEntry(sb, "c", skill.c, tabs);
	AppendEntryString(sb, "s", skill.s, tabs);
	AppendEntryString(sb, "all", skill.all, tabs);
}

private static void Normalize(string fileName, bool downloadFiles)
{
	string filepath = Path.Combine(path, fileName);
	string url = Path.Combine(baseUrl, fileName);
	if (downloadFiles)
	{
		webClient.DownloadFile(url, filepath);
	}
	XDocument.Load(filepath).Save(filepath);
}