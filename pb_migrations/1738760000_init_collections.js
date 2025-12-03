migrate((db) => {
  const leads = new Collection({
    id: "leads12345",
    created: "2025-01-01 00:00:00.000Z",
    updated: "2025-01-01 00:00:00.000Z",
    name: "leads",
    type: "base",
    system: false,
    schema: [
      new SchemaField({
        system: false,
        id: "ownrrel",
        name: "owner",
        type: "relation",
        required: true,
        unique: false,
        options: {
          collectionId: "_pb_users_auth_",
          cascadeDelete: true,
          minSelect: null,
          maxSelect: 1,
          displayFields: [],
        },
      }),
      new SchemaField({
        system: false,
        id: "compny",
        name: "company",
        type: "text",
        required: true,
        unique: false,
        options: {
          min: null,
          max: null,
          pattern: "",
        },
      }),
      new SchemaField({
        system: false,
        id: "cntname",
        name: "contact_name",
        type: "text",
        required: false,
        unique: false,
        options: {
          min: null,
          max: null,
          pattern: "",
        },
      }),
      new SchemaField({
        system: false,
        id: "tradefld",
        name: "trade",
        type: "text",
        required: false,
        unique: false,
        options: {
          min: null,
          max: null,
          pattern: "",
        },
      }),
      new SchemaField({
        system: false,
        id: "phonefld",
        name: "phone",
        type: "text",
        required: false,
        unique: false,
        options: {
          min: null,
          max: null,
          pattern: "",
        },
      }),
      new SchemaField({
        system: false,
        id: "emailfld",
        name: "email",
        type: "email",
        required: false,
        unique: false,
        options: {
          onlyDomains: null,
        },
      }),
      new SchemaField({
        system: false,
        id: "statusfld",
        name: "status",
        type: "text",
        required: false,
        unique: false,
        options: {
          min: null,
          max: null,
          pattern: "",
        },
      }),
      new SchemaField({
        system: false,
        id: "nextact",
        name: "next_action",
        type: "date",
        required: false,
        unique: false,
        options: {
          min: "",
          max: "",
        },
      }),
      new SchemaField({
        system: false,
        id: "lastout",
        name: "last_outcome",
        type: "text",
        required: false,
        unique: false,
        options: {
          min: null,
          max: null,
          pattern: "",
        },
      }),
      new SchemaField({
        system: false,
        id: "notesfld",
        name: "notes",
        type: "text",
        required: false,
        unique: false,
        options: {
          min: null,
          max: null,
          pattern: "",
        },
      }),
    ],
    indexes: [],
    listRule: "owner = @request.auth.id",
    viewRule: "owner = @request.auth.id",
    createRule: "@request.auth.id != '' && owner = @request.auth.id",
    updateRule: "owner = @request.auth.id",
    deleteRule: "owner = @request.auth.id",
    options: {},
  });

  const callLogs = new Collection({
    id: "calllogs01",
    created: "2025-01-01 00:00:00.000Z",
    updated: "2025-01-01 00:00:00.000Z",
    name: "call_logs",
    type: "base",
    system: false,
    schema: [
      new SchemaField({
        system: false,
        id: "ownercl",
        name: "owner",
        type: "relation",
        required: true,
        unique: false,
        options: {
          collectionId: "_pb_users_auth_",
          cascadeDelete: true,
          minSelect: null,
          maxSelect: 1,
          displayFields: [],
        },
      }),
      new SchemaField({
        system: false,
        id: "leadrel",
        name: "lead",
        type: "relation",
        required: true,
        unique: false,
        options: {
          collectionId: "leads12345",
          cascadeDelete: true,
          minSelect: null,
          maxSelect: 1,
          displayFields: [],
        },
      }),
      new SchemaField({
        system: false,
        id: "outcome",
        name: "outcome",
        type: "text",
        required: true,
        unique: false,
        options: {
          min: null,
          max: null,
          pattern: "",
        },
      }),
      new SchemaField({
        system: false,
        id: "notescl",
        name: "notes",
        type: "text",
        required: false,
        unique: false,
        options: {
          min: null,
          max: null,
          pattern: "",
        },
      }),
      new SchemaField({
        system: false,
        id: "nextcl",
        name: "next_action",
        type: "date",
        required: false,
        unique: false,
        options: {
          min: "",
          max: "",
        },
      }),
    ],
    indexes: [],
    listRule: "owner = @request.auth.id",
    viewRule: "owner = @request.auth.id",
    createRule: "@request.auth.id != '' && owner = @request.auth.id",
    updateRule: "",
    deleteRule: "owner = @request.auth.id",
    options: {},
  });

  const dao = new Dao(db);
  dao.saveCollection(leads);
  dao.saveCollection(callLogs);
}, (db) => {
  const dao = new Dao(db);
  const callLogs = dao.findCollectionByNameOrId("call_logs");
  const leads = dao.findCollectionByNameOrId("leads");

  if (callLogs) dao.deleteCollection(callLogs);
  if (leads) dao.deleteCollection(leads);
});
