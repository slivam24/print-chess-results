// Přednastavené profily – vznikly z profilů, které si pořadatel vytvořil při skutečném použití
// (export z appky 20. 11. 2026). Používají se při prvním spuštění a tlačítkem
// „Přidat přednastavené profily“ v Nastavení → Profily.

export const PRESET_PROFILES = [
  {
    "name": "Švýcar jednotlivců",
    "page": {
      "orientation": "portrait",
      "margins": {
        "top": 5,
        "right": 5,
        "bottom": 5,
        "left": 5
      },
      "fontFamily": "Arial, Helvetica, sans-serif",
      "fontSize": 10,
      "tableStyle": "grid"
    },
    "nameFormat": "last-first",
    "header": {
      "enabled": true,
      "align": "left",
      "title": "{turnaj}",
      "subtitle": "{misto}, {datum}",
      "organizer": "",
      "arbiter": "{rozhodci}",
      "text": "",
      "logo": null,
      "logoHeight": 16,
      "logoPosition": "left",
      "everyPage": false
    },
    "footer": {
      "enabled": false,
      "text": "",
      "showPageNumbers": false,
      "showPrinted": false,
      "showSource": false
    },
    "templates": {
      "pairings": {
        "columnsVersion": 1,
        "columns": [
          {
            "key": "board",
            "on": true
          },
          {
            "key": "wNo",
            "on": false
          },
          {
            "key": "wTitle",
            "on": false
          },
          {
            "key": "wName",
            "on": true
          },
          {
            "key": "wFed",
            "on": false
          },
          {
            "key": "wRating",
            "on": true
          },
          {
            "key": "wRatingNat",
            "on": false
          },
          {
            "key": "wClub",
            "on": false
          },
          {
            "key": "wPoints",
            "on": true
          },
          {
            "key": "result",
            "on": true
          },
          {
            "key": "bPoints",
            "on": true
          },
          {
            "key": "bTitle",
            "on": false
          },
          {
            "key": "bName",
            "on": true
          },
          {
            "key": "bFed",
            "on": false
          },
          {
            "key": "bRating",
            "on": true
          },
          {
            "key": "bRatingNat",
            "on": false
          },
          {
            "key": "bClub",
            "on": false
          },
          {
            "key": "bNo",
            "on": false
          }
        ],
        "fontMode": "max",
        "pageColumns": 1,
        "orientation": "portrait"
      },
      "ranking": {
        "orientation": "portrait",
        "fontMode": "max",
        "columnsVersion": 1,
        "columns": [
          {
            "key": "rank",
            "on": true
          },
          {
            "key": "startNo",
            "on": true
          },
          {
            "key": "title",
            "on": true
          },
          {
            "key": "name",
            "on": true
          },
          {
            "key": "group",
            "on": true
          },
          {
            "key": "fed",
            "on": false
          },
          {
            "key": "rating",
            "on": true
          },
          {
            "key": "ratingNat",
            "on": true
          },
          {
            "key": "club",
            "on": true
          },
          {
            "key": "points",
            "on": true
          },
          {
            "key": "tb1",
            "on": true
          },
          {
            "key": "tb2",
            "on": true
          },
          {
            "key": "tb3",
            "on": true
          },
          {
            "key": "tb4",
            "on": true
          },
          {
            "key": "tb5",
            "on": true
          },
          {
            "key": "tb6",
            "on": true
          }
        ]
      },
      "pairings-board": {
        "orientation": "portrait",
        "fontMode": "max"
      },
      "startlist": {
        "orientation": "portrait",
        "fontMode": "max"
      },
      "alphalist": {
        "orientation": "portrait",
        "fontMode": "max"
      },
      "ranking-cat": {
        "options": {
          "categories": [
            {
              "id": "cmwkgi35culsm",
              "name": "S50",
              "types": [
                "S50"
              ],
              "groups": [],
              "sex": [],
              "on": true
            },
            {
              "id": "cmwkgi35cj6bx",
              "name": "S65",
              "types": [
                "S50",
                "S65"
              ],
              "groups": [],
              "sex": [],
              "on": true
            },
            {
              "id": "cmwkgi35cnjvl",
              "name": "U10",
              "types": [
                "U10"
              ],
              "groups": [],
              "sex": [],
              "on": true
            },
            {
              "id": "cmwkgi35c0vqt",
              "name": "U12",
              "types": [
                "U10",
                "U12"
              ],
              "groups": [],
              "sex": [],
              "on": true
            },
            {
              "id": "cmwkgi35c34dq",
              "name": "U16",
              "types": [
                "U10",
                "U12",
                "U16"
              ],
              "groups": [],
              "sex": [],
              "on": true
            }
          ],
          "withOverall": true,
          "legend": false,
          "catLayout": "flow"
        },
        "orientation": "portrait",
        "fontMode": "max",
        "columnsVersion": 1,
        "columns": [
          {
            "key": "rank",
            "on": true
          },
          {
            "key": "rankAll",
            "on": true
          },
          {
            "key": "startNo",
            "on": false
          },
          {
            "key": "title",
            "on": true
          },
          {
            "key": "name",
            "on": true
          },
          {
            "key": "fed",
            "on": false
          },
          {
            "key": "rating",
            "on": true
          },
          {
            "key": "ratingNat",
            "on": true
          },
          {
            "key": "sex",
            "on": false
          },
          {
            "key": "type",
            "on": true
          },
          {
            "key": "group",
            "on": true
          },
          {
            "key": "club",
            "on": true
          },
          {
            "key": "points",
            "on": true
          },
          {
            "key": "tb1",
            "on": true
          },
          {
            "key": "tb2",
            "on": true
          },
          {
            "key": "tb3",
            "on": true
          },
          {
            "key": "tb4",
            "on": false
          },
          {
            "key": "tb5",
            "on": false
          },
          {
            "key": "tb6",
            "on": false
          }
        ]
      }
    },
    "hiddenTemplates": [
      "pairings-alpha",
      "arbiter-sheet",
      "scoresheets",
      "pairings-board"
    ]
  },
  {
    "name": "Každý s každým jednotlivci",
    "page": {
      "orientation": "portrait",
      "margins": {
        "top": 5,
        "right": 5,
        "bottom": 5,
        "left": 5
      },
      "fontFamily": "Arial, Helvetica, sans-serif",
      "fontSize": 10,
      "tableStyle": "grid"
    },
    "nameFormat": "last-first",
    "header": {
      "enabled": true,
      "align": "left",
      "title": "{turnaj}",
      "subtitle": "{misto}, {datum}",
      "organizer": "",
      "arbiter": "{rozhodci}",
      "text": "",
      "logo": null,
      "logoHeight": 16,
      "logoPosition": "left",
      "everyPage": false
    },
    "footer": {
      "enabled": false,
      "text": "",
      "showPageNumbers": false,
      "showPrinted": false,
      "showSource": false
    },
    "templates": {
      "pairings": {
        "columnsVersion": 1,
        "columns": [
          {
            "key": "board",
            "on": true
          },
          {
            "key": "wNo",
            "on": false
          },
          {
            "key": "wTitle",
            "on": false
          },
          {
            "key": "wName",
            "on": true
          },
          {
            "key": "wFed",
            "on": false
          },
          {
            "key": "wRating",
            "on": true
          },
          {
            "key": "wRatingNat",
            "on": false
          },
          {
            "key": "wClub",
            "on": false
          },
          {
            "key": "wPoints",
            "on": true
          },
          {
            "key": "result",
            "on": true
          },
          {
            "key": "bPoints",
            "on": true
          },
          {
            "key": "bTitle",
            "on": false
          },
          {
            "key": "bName",
            "on": true
          },
          {
            "key": "bFed",
            "on": false
          },
          {
            "key": "bRating",
            "on": true
          },
          {
            "key": "bRatingNat",
            "on": false
          },
          {
            "key": "bClub",
            "on": false
          },
          {
            "key": "bNo",
            "on": false
          }
        ],
        "fontMode": "fixed",
        "pageColumns": 1,
        "orientation": "portrait",
        "options": {
          "showResults": true
        },
        "fontSize": 14.5,
        "header": "off",
        "fontMax": 18
      },
      "ranking": {
        "orientation": "portrait",
        "fontMode": "max",
        "columnsVersion": 1,
        "columns": [
          {
            "key": "rank",
            "on": true
          },
          {
            "key": "startNo",
            "on": true
          },
          {
            "key": "title",
            "on": true
          },
          {
            "key": "name",
            "on": true
          },
          {
            "key": "group",
            "on": true
          },
          {
            "key": "fed",
            "on": false
          },
          {
            "key": "rating",
            "on": true
          },
          {
            "key": "ratingNat",
            "on": true
          },
          {
            "key": "club",
            "on": true
          },
          {
            "key": "points",
            "on": true
          },
          {
            "key": "tb1",
            "on": true
          },
          {
            "key": "tb2",
            "on": true
          },
          {
            "key": "tb3",
            "on": true
          },
          {
            "key": "tb4",
            "on": true
          },
          {
            "key": "tb5",
            "on": true
          },
          {
            "key": "tb6",
            "on": true
          }
        ]
      },
      "pairings-board": {
        "orientation": "portrait",
        "fontMode": "max"
      },
      "startlist": {
        "orientation": "portrait",
        "fontMode": "max",
        "columnsVersion": 1,
        "columns": [
          {
            "key": "startNo",
            "on": true
          },
          {
            "key": "title",
            "on": true
          },
          {
            "key": "name",
            "on": true
          },
          {
            "key": "fideId",
            "on": false
          },
          {
            "key": "fed",
            "on": false
          },
          {
            "key": "rating",
            "on": true
          },
          {
            "key": "ratingNat",
            "on": true
          },
          {
            "key": "type",
            "on": true
          },
          {
            "key": "group",
            "on": true
          },
          {
            "key": "club",
            "on": true
          }
        ]
      },
      "alphalist": {
        "orientation": "portrait",
        "fontMode": "max",
        "columnsVersion": 2,
        "columns": [
          {
            "key": "rowNo",
            "on": true
          },
          {
            "key": "startNo",
            "on": true
          },
          {
            "key": "title",
            "on": true
          },
          {
            "key": "name",
            "on": true
          },
          {
            "key": "ratingNat",
            "on": true
          },
          {
            "key": "rating",
            "on": true
          },
          {
            "key": "fed",
            "on": false
          },
          {
            "key": "club",
            "on": true
          },
          {
            "key": "fideId",
            "on": false
          },
          {
            "key": "type",
            "on": false
          },
          {
            "key": "group",
            "on": false
          }
        ]
      },
      "ranking-cat": {
        "options": {
          "categories": [],
          "withOverall": true,
          "legend": false,
          "catLayout": "flow"
        },
        "orientation": "portrait",
        "fontMode": "max",
        "columnsVersion": 1,
        "columns": [
          {
            "key": "rank",
            "on": true
          },
          {
            "key": "rankAll",
            "on": true
          },
          {
            "key": "startNo",
            "on": false
          },
          {
            "key": "title",
            "on": true
          },
          {
            "key": "name",
            "on": true
          },
          {
            "key": "fed",
            "on": false
          },
          {
            "key": "rating",
            "on": true
          },
          {
            "key": "ratingNat",
            "on": true
          },
          {
            "key": "sex",
            "on": false
          },
          {
            "key": "type",
            "on": true
          },
          {
            "key": "group",
            "on": true
          },
          {
            "key": "club",
            "on": true
          },
          {
            "key": "points",
            "on": true
          },
          {
            "key": "tb1",
            "on": true
          },
          {
            "key": "tb2",
            "on": true
          },
          {
            "key": "tb3",
            "on": true
          },
          {
            "key": "tb4",
            "on": false
          },
          {
            "key": "tb5",
            "on": false
          },
          {
            "key": "tb6",
            "on": false
          }
        ]
      }
    },
    "hiddenTemplates": [
      "pairings-alpha",
      "arbiter-sheet",
      "scoresheets",
      "pairings-board"
    ]
  },
  {
    "name": "Každý s každým – družstva školy",
    "page": {
      "orientation": "portrait",
      "margins": {
        "top": 5,
        "right": 5,
        "bottom": 5,
        "left": 5
      },
      "fontFamily": "Arial, Helvetica, sans-serif",
      "fontSize": 10,
      "tableStyle": "grid"
    },
    "nameFormat": "last-first",
    "header": {
      "enabled": true,
      "align": "left",
      "title": "{turnaj}",
      "subtitle": "{misto}, {datum}",
      "organizer": "",
      "arbiter": "{rozhodci}",
      "text": "",
      "logo": null,
      "logoHeight": 16,
      "logoPosition": "left",
      "everyPage": false
    },
    "footer": {
      "enabled": false,
      "text": "",
      "showPageNumbers": false,
      "showPrinted": false,
      "showSource": false
    },
    "templates": {
      "pairings": {
        "columnsVersion": 1,
        "columns": [
          {
            "key": "board",
            "on": true
          },
          {
            "key": "wNo",
            "on": false
          },
          {
            "key": "wTitle",
            "on": false
          },
          {
            "key": "wName",
            "on": true
          },
          {
            "key": "wFed",
            "on": false
          },
          {
            "key": "wRating",
            "on": true
          },
          {
            "key": "wRatingNat",
            "on": false
          },
          {
            "key": "wClub",
            "on": false
          },
          {
            "key": "wPoints",
            "on": true
          },
          {
            "key": "result",
            "on": true
          },
          {
            "key": "bPoints",
            "on": true
          },
          {
            "key": "bTitle",
            "on": false
          },
          {
            "key": "bName",
            "on": true
          },
          {
            "key": "bFed",
            "on": false
          },
          {
            "key": "bRating",
            "on": true
          },
          {
            "key": "bRatingNat",
            "on": false
          },
          {
            "key": "bClub",
            "on": false
          },
          {
            "key": "bNo",
            "on": false
          }
        ],
        "fontMode": "fixed",
        "pageColumns": 1,
        "orientation": "portrait",
        "options": {
          "showResults": true
        },
        "fontSize": 14.5,
        "header": "off",
        "fontMax": 18
      },
      "ranking": {
        "orientation": "portrait",
        "fontMode": "max",
        "columnsVersion": 1,
        "columns": [
          {
            "key": "rank",
            "on": true
          },
          {
            "key": "startNo",
            "on": true
          },
          {
            "key": "title",
            "on": true
          },
          {
            "key": "name",
            "on": true
          },
          {
            "key": "group",
            "on": true
          },
          {
            "key": "fed",
            "on": false
          },
          {
            "key": "rating",
            "on": true
          },
          {
            "key": "ratingNat",
            "on": true
          },
          {
            "key": "club",
            "on": true
          },
          {
            "key": "points",
            "on": true
          },
          {
            "key": "tb1",
            "on": true
          },
          {
            "key": "tb2",
            "on": true
          },
          {
            "key": "tb3",
            "on": true
          },
          {
            "key": "tb4",
            "on": true
          },
          {
            "key": "tb5",
            "on": true
          },
          {
            "key": "tb6",
            "on": true
          }
        ]
      },
      "pairings-board": {
        "orientation": "portrait",
        "fontMode": "max"
      },
      "startlist": {
        "orientation": "portrait",
        "fontMode": "max",
        "columnsVersion": 1,
        "columns": [
          {
            "key": "startNo",
            "on": true
          },
          {
            "key": "title",
            "on": true
          },
          {
            "key": "name",
            "on": true
          },
          {
            "key": "fideId",
            "on": false
          },
          {
            "key": "fed",
            "on": false
          },
          {
            "key": "rating",
            "on": true
          },
          {
            "key": "ratingNat",
            "on": true
          },
          {
            "key": "type",
            "on": true
          },
          {
            "key": "group",
            "on": true
          },
          {
            "key": "club",
            "on": true
          }
        ]
      },
      "alphalist": {
        "orientation": "portrait",
        "fontMode": "max",
        "columnsVersion": 2,
        "columns": [
          {
            "key": "rowNo",
            "on": true
          },
          {
            "key": "startNo",
            "on": true
          },
          {
            "key": "title",
            "on": true
          },
          {
            "key": "name",
            "on": true
          },
          {
            "key": "ratingNat",
            "on": true
          },
          {
            "key": "rating",
            "on": true
          },
          {
            "key": "fed",
            "on": false
          },
          {
            "key": "club",
            "on": true
          },
          {
            "key": "fideId",
            "on": false
          },
          {
            "key": "type",
            "on": false
          },
          {
            "key": "group",
            "on": false
          }
        ]
      },
      "ranking-cat": {
        "options": {
          "categories": [],
          "withOverall": true,
          "legend": false,
          "catLayout": "flow"
        },
        "orientation": "portrait",
        "fontMode": "max",
        "columnsVersion": 1,
        "columns": [
          {
            "key": "rank",
            "on": true
          },
          {
            "key": "rankAll",
            "on": true
          },
          {
            "key": "startNo",
            "on": false
          },
          {
            "key": "title",
            "on": true
          },
          {
            "key": "name",
            "on": true
          },
          {
            "key": "fed",
            "on": false
          },
          {
            "key": "rating",
            "on": true
          },
          {
            "key": "ratingNat",
            "on": true
          },
          {
            "key": "sex",
            "on": false
          },
          {
            "key": "type",
            "on": true
          },
          {
            "key": "group",
            "on": true
          },
          {
            "key": "club",
            "on": true
          },
          {
            "key": "points",
            "on": true
          },
          {
            "key": "tb1",
            "on": true
          },
          {
            "key": "tb2",
            "on": true
          },
          {
            "key": "tb3",
            "on": true
          },
          {
            "key": "tb4",
            "on": false
          },
          {
            "key": "tb5",
            "on": false
          },
          {
            "key": "tb6",
            "on": false
          }
        ]
      },
      "team-roster": {
        "columnsVersion": 1,
        "columns": [
          {
            "key": "board",
            "on": true
          },
          {
            "key": "title",
            "on": true
          },
          {
            "key": "name",
            "on": true
          },
          {
            "key": "fideId",
            "on": false
          },
          {
            "key": "fed",
            "on": false
          },
          {
            "key": "rating",
            "on": true
          },
          {
            "key": "ratingNat",
            "on": true
          },
          {
            "key": "group",
            "on": false
          }
        ],
        "orientation": "portrait",
        "fontMode": "fixed",
        "options": {
          "teamsOnly": false,
          "teamPerPage": false
        },
        "pageColumns": 1,
        "fontSize": 15,
        "fontMax": 19.5
      },
      "team-boards": {
        "options": {
          "matchPerPage": false,
          "showResults": false,
          "signatures": false,
          "ratings": true,
          "blankBoards": 4
        },
        "orientation": "portrait",
        "fontMode": "max",
        "columnsVersion": 1,
        "columns": [
          {
            "key": "board",
            "on": true
          },
          {
            "key": "homeColor",
            "on": false
          },
          {
            "key": "homeRoster",
            "on": true,
            "label": "č.s."
          },
          {
            "key": "home",
            "on": true
          },
          {
            "key": "homeRating",
            "on": false
          },
          {
            "key": "result",
            "on": true
          },
          {
            "key": "awayColor",
            "on": false
          },
          {
            "key": "away",
            "on": true
          },
          {
            "key": "awayRoster",
            "on": true,
            "label": "č.s."
          },
          {
            "key": "awayRating",
            "on": false
          }
        ],
        "header": "off",
        "footer": "off",
        "rowHeight": 3,
        "fontMax": 20,
        "fontSize": 19
      },
      "team-matches": {
        "orientation": "portrait",
        "fontMode": "max"
      },
      "team-startlist": {
        "orientation": "portrait",
        "fontMode": "max"
      }
    },
    "hiddenTemplates": [
      "pairings-alpha",
      "arbiter-sheet",
      "scoresheets",
      "pairings-board"
    ]
  }
];
