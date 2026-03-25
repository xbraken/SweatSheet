import { NextResponse } from 'next/server'
import plist from 'plist'

// Encode a plist value to binary bplist00 format
// We use plist.build() for XML then rely on iOS accepting XML plists named .shortcut
// iOS Shortcuts can import XML plist files directly.

function makeShortcut(baseUrl: string): string {
  const apiUrl = `${baseUrl}/api/import/shortcut`

  // WFVariable reference helper
  const varRef = (name: string) => ({
    Value: { Type: 'Variable', VariableName: name },
    WFSerializationType: 'WFTextTokenAttachment',
  })

  // Magic number reference (output of previous action)
  const magicRef = (uuid: string) => ({
    Value: { OutputUUID: uuid, Type: 'ActionOutput' },
    WFSerializationType: 'WFTextTokenAttachment',
  })

  const uuidDays      = 'uuid-days'
  const uuidDateFrom  = 'uuid-date-from'
  const uuidWorkouts  = 'uuid-workouts'
  const uuidHr        = 'uuid-hr'
  const uuidBody      = 'uuid-body'
  const uuidResult    = 'uuid-result'

  const actions = [
    // 0 — Ask how many days back
    {
      WFWorkflowActionIdentifier: 'is.workflow.actions.ask',
      WFWorkflowActionParameters: {
        WFAskActionPrompt: 'Sync how many days back?',
        WFInputType: 'Number',
        WFDefaultAnswerValue: '7',
        UUID: uuidDays,
      },
    },
    // 1 — Calculate date N days ago
    {
      WFWorkflowActionIdentifier: 'is.workflow.actions.date',
      WFWorkflowActionParameters: {
        WFDateActionMode: 'Relative',
        WFTimeUntilUnit: 'Days',
        WFTimeUntilDateIsNeg: true,
        WFTimeUntilDate: { Value: { attachmentsByRange: { '{0, 1}': magicRef(uuidDays) }, string: '{0}' }, WFSerializationType: 'WFTextTokenString' },
        UUID: uuidDateFrom,
      },
    },
    // 2 — Get workouts from Health after that date
    {
      WFWorkflowActionIdentifier: 'is.workflow.actions.getmyworkouts',
      WFWorkflowActionParameters: {
        WFGetWorkoutsActionType: 'Every Workout',
        WFWorkoutActionStartDate: { Value: { attachmentsByRange: { '{0, 1}': magicRef(uuidDateFrom) }, string: '{0}' }, WFSerializationType: 'WFTextTokenString' },
        UUID: uuidWorkouts,
      },
    },
    // 3 — Repeat with each workout, build list
    {
      WFWorkflowActionIdentifier: 'is.workflow.actions.repeat.each',
      WFWorkflowActionParameters: {
        WFInput: { Value: { attachmentsByRange: { '{0, 1}': magicRef(uuidWorkouts) }, string: '{0}' }, WFSerializationType: 'WFTextTokenString' },
      },
    },
    // 4 — Append workout dict to variable
    {
      WFWorkflowActionIdentifier: 'is.workflow.actions.appendvariable',
      WFWorkflowActionParameters: {
        WFInput: {
          Value: {
            WFDictionaryFieldValueItems: [
              { WFItemType: 0, WFKey: { Value: { string: 'type' }, WFSerializationType: 'WFTextTokenString' }, WFValue: { Value: { string: 'Running' }, WFSerializationType: 'WFTextTokenString' } },
              { WFItemType: 0, WFKey: { Value: { string: 'startDate' }, WFSerializationType: 'WFTextTokenString' }, WFValue: { Value: { attachmentsByRange: { '{0, 1}': { Value: { Type: 'ExtensionInput' }, WFSerializationType: 'WFTextTokenAttachment' } }, string: '{0}' }, WFSerializationType: 'WFTextTokenString' } },
            ],
          },
          WFSerializationType: 'WFDictionaryFieldValue',
        },
        WFVariableName: 'workouts',
      },
    },
    // 5 — End repeat
    {
      WFWorkflowActionIdentifier: 'is.workflow.actions.repeat.each.end',
      WFWorkflowActionParameters: {},
    },
    // 6 — Get HR samples
    {
      WFWorkflowActionIdentifier: 'is.workflow.actions.getsamplesfromhealth',
      WFWorkflowActionParameters: {
        WFHealthSampleType: 'Heart Rate',
        WFHealthStartDate: { Value: { attachmentsByRange: { '{0, 1}': magicRef(uuidDateFrom) }, string: '{0}' }, WFSerializationType: 'WFTextTokenString' },
        UUID: uuidHr,
      },
    },
    // 7 — Build JSON body
    {
      WFWorkflowActionIdentifier: 'is.workflow.actions.dictionary',
      WFWorkflowActionParameters: {
        WFInput: {
          Value: {
            WFDictionaryFieldValueItems: [
              {
                WFItemType: 2,
                WFKey: { Value: { string: 'workouts' }, WFSerializationType: 'WFTextTokenString' },
                WFValue: { Value: { attachmentsByRange: { '{0, 1}': varRef('workouts') }, string: '{0}' }, WFSerializationType: 'WFTextTokenString' },
              },
              {
                WFItemType: 2,
                WFKey: { Value: { string: 'hrSamples' }, WFSerializationType: 'WFTextTokenString' },
                WFValue: { Value: { attachmentsByRange: { '{0, 1}': magicRef(uuidHr) }, string: '{0}' }, WFSerializationType: 'WFTextTokenString' },
              },
            ],
          },
          WFSerializationType: 'WFDictionaryFieldValue',
        },
        UUID: uuidBody,
      },
    },
    // 8 — POST to SweatSheet
    {
      WFWorkflowActionIdentifier: 'is.workflow.actions.downloadurl',
      WFWorkflowActionParameters: {
        WFURL: apiUrl,
        WFHTTPMethod: 'POST',
        WFHTTPHeaders: {
          Value: {
            WFDictionaryFieldValueItems: [
              {
                WFItemType: 0,
                WFKey: { Value: { string: 'X-API-Key' }, WFSerializationType: 'WFTextTokenString' },
                WFValue: { Value: { attachmentsByRange: { '{0, 1}': varRef('SweatSheet API Key') }, string: '{0}' }, WFSerializationType: 'WFTextTokenString' },
              },
              {
                WFItemType: 0,
                WFKey: { Value: { string: 'Content-Type' }, WFSerializationType: 'WFTextTokenString' },
                WFValue: { Value: { string: 'application/json' }, WFSerializationType: 'WFTextTokenString' },
              },
            ],
          },
          WFSerializationType: 'WFDictionaryFieldValue',
        },
        WFHTTPBody: { Value: { attachmentsByRange: { '{0, 1}': magicRef(uuidBody) }, string: '{0}' }, WFSerializationType: 'WFTextTokenString' },
        WFHTTPBodyType: 'JSON',
        UUID: uuidResult,
      },
    },
    // 9 — Show result notification
    {
      WFWorkflowActionIdentifier: 'is.workflow.actions.notification',
      WFWorkflowActionParameters: {
        WFNotificationActionTitle: 'SweatSheet Sync',
        WFNotificationActionBody: { Value: { attachmentsByRange: { '{0, 1}': magicRef(uuidResult) }, string: '{0}' }, WFSerializationType: 'WFTextTokenString' },
      },
    },
  ]

  return plist.build({
    WFWorkflowActions: actions,
    WFWorkflowClientVersion: '1136.14',
    WFWorkflowHasShortcutInputVariables: false,
    WFWorkflowIcon: {
      WFWorkflowIconStartColor: 0x4bdece00,
      WFWorkflowIconGlyphNumber: 59511,
    },
    WFWorkflowImportQuestions: [
      {
        ParameterKey: 'SweatSheet API Key',
        Category: 'Parameter',
        Text: 'Paste your SweatSheet API Key (from Account → Shortcut Sync)',
        DefaultValue: '',
        ActionIndex: 8,
      },
    ],
    WFWorkflowInputContentItemClasses: [],
    WFWorkflowMinimumClientVersionString: '900',
    WFWorkflowName: 'SweatSheet Sync',
    WFWorkflowNoInputBehavior: {
      Name: 'WFWorkflowNoInputBehaviorAskForInput',
      Parameters: { ItemClass: 'WFStringContentItem' },
    },
    WFWorkflowOutputContentItemClasses: [],
    WFWorkflowTypes: ['WFWorkflowTypeNormal'],
  } as unknown as plist.PlistObject)
}

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://sweat-sheet.vercel.app'
  const xml = makeShortcut(baseUrl)

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/x-plist',
      'Content-Disposition': 'attachment; filename="SweatSheet Sync.shortcut"',
    },
  })
}
