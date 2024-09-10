'use strict';

var dateFormat = require('dateformat');
var Mustache = require('mustache');
var util = require('util');
var process = require('process');
var StatefulProcessCommandProxy = require('stateful-process-command-proxy');

/********************************
* Command line argument handling
*********************************/
var argv = require("yargs")
    .usage('Usage: $0 <command> [options]')
    .command('dir', 'Monitor a directory and react to changes')

    .demand('logging.file')
        .describe('logging.file','Full path to log file')

    .default('logging.level','debug')
        .describe('logging.level','Logging level')
        .choices('logging.level',['error','warn','info','verbose','info','debug','silly'])

    .default('logging.maxsize',10485760)
        .describe('logging.maxsize','Max size before rotation, in bytes')

    .default('logging.maxfiles',20)
        .describe('logging.maxfiles','Max rotated files to retain')

    .demand('monitor.dir')
        .describe('monitor.dir','Directory to monitor')

    .default('monitor.stabilityThreshold',30000)
        .describe('monitor.stabilityThreshold',' Milliseconds for file sizes to remain constant before reacting.')

    .demand('evaluator.events')
        .array('evaluator.events')
        .describe('evaluator.events','Space separated list of relevant event types')
        .choices('evaluator.events',['add','addDir','change','unlink','unlinkDir'])

    .demand('evaluator.regex')
        .describe('evaluator.regex','Regex to apply to ioEvent.fullPath to trigger reactors')


    .demand('evaluator.reactors')
        .array('evaluator.reactors')
        .describe('evaluator.reactors','Ordered list of reactors')
        .choices('evaluator.reactors',['mkdir','copyFile','moveFile','copyAll','moveAll','extractFile','sqlInsert'])


    .default('reactor.mkdir.dir',null)
        .describe('reactor.mkdir.dir','Target dir create. Variables apply.')

    .default('reactor.copyAll.target',null)
        .describe('reactor.copyAll.target','Target dir to copy all files in monitored dir TO. Variables apply.')
    .default('reactor.moveAll.target',null)
        .describe('reactor.moveAll.target','Target dir to move all files in monitored dir TO. Variables apply.')

    .default('reactor.copyFile.target',null)
        .describe('reactor.copyFile.target','Target dir to copy evaluated file TO. Variables apply.')
    .default('reactor.moveFile.target',null)
        .describe('reactor.moveFile.target','Target dir to move evaluated file TO. Variables apply.')

    .default('reactor.extractFile.target',null)
        .describe('reactor.extractFile.target','Target dir to extract evaluated file TO. Variables apply.')

    .default('reactor.sqlInsert.table',null)
        .describe('reactor.sqlInsert.table','Table name for sql insert')
    .default('reactor.sqlInsert.columns',null)
        .array('reactor.sqlInsert.columns')
        .describe('reactor.sqlInsert.columns','Space separated list of target table columns.')
    .default('reactor.sqlInsert.values',null)
        .array('reactor.sqlInsert.values')
        .describe('reactor.sqlInsert.values','Space separated list of column values. Variables apply.')

    .default('reactor.shell.uid',process.getuid())
        .describe('reactor.shell.uid','uid to run shell commands as')
    .default('reactor.shell.gid',process.getgid())
        .describe('reactor.shell.gid','gid to run shell commands as')

    .default('reactor.db.host',null)
        .describe('reactor.db.host','database host')
    .default('reactor.db.port',3306)
        .describe('reactor.db.port','database port')
    .default('reactor.db.user',null)
        .describe('reactor.db.user','database user')
    .default('reactor.db.pw',null)
        .describe('reactor.db.pw','database pw')
    .default('reactor.db.name',null)
        .describe('reactor.db.name','database name')
    .default('reactor.db.ssl.ca',null)
        .describe('reactor.db.ssl.ca','full path to ca certificate')
    .default('reactor.db.ssl.cert',null)
      .describe('reactor.db.ssl.cert','full path to certificate')
    .default('reactor.db.ssl.key',null)
      .describe('reactor.db.ssl.key','full path to private key')
    .default('reactor.db.ssl.minVersion',null)
      .describe('reactor.db.ssl.minVersion','min ssl protocal version')
    .default('reactor.db.ssl.maxVersion',null)
      .describe('reactor.db.ssl.maxVersion','max ssl protocal version')
    .default('reactor.db.ssl.rejectUnauthorized',null)
      .describe('reactor.db.ssl.rejectUnauthorized','verify certificate against suppied CAs and hostname')      
    .epilogue("For certain options you can use the following variables:\n" +
              " {{ioEvent.context.timestamp}}\n" +
              " {{ioEvent.eventType}}\n" +
              " {{ioEvent.fullPath}}\n" +
              " {{ioEvent.parentPath}}\n" +
              " {{ioEvent.parentName}}\n" +
              " {{ioEvent.filename}}\n" +
              " {{ioEvent.uuid}}\n" +
              " {{ioEvent.context.[copyAll | copyFile | moveAll | moveFile | extractFileTo].target}}\n"
    )

    .argv;

console.log(util.inspect(argv,{depth:10}));

/********************************
* Logging/Errors
*********************************/
var winston = require('winston');
winston.add(winston.transports.File,
            {
                filename: argv.logging.file,
                maxsize: argv.logging.maxsize,
                maxfiles: argv.logging.maxfiles
            });
winston.level = argv.logging.level;

var logCallback = function(severity, origin, message) {
    if (origin != 'Pool') {
        winston.log(severity,origin + " - " + message);
    }
};

var errorCallback = function(message,error) {
    winston.log('error',message + " - " + util.inspect(error));
}

/********************************
* IoReactor
*********************************/
var IoReactorService = require("io-event-reactor");
var EvaluatorUtil = require('io-event-reactor/ioReactor').EvaluatorUtil;


/**
* generateSqlInsert - generates a new io-event-reactor-plugin-mysql plugin config
*
* @param reactorId id of the reactor to create
* @param sqlTemplates
* @param sqlGenerator
*/
function generateSqlInsert(reactorId, sqlTemplates, sqlGenerator) {
    const fs = require('fs');

    // MySQL SSL connection configuration
    var sslConfig = {};
    sslConfig = {...sslConfig, ...argv.reactor.db.ssl.ca ? {ca: fs.readFileSync(argv.reactor.db.ssl.ca)} : {}};
    sslConfig = {...sslConfig, ...argv.reactor.db.ssl.cert ? {cert: fs.readFileSync(argv.reactor.db.ssl.cert)} : {}};
    sslConfig = {...sslConfig, ...argv.reactor.db.ssl.key ? {key: fs.readFileSync(argv.reactor.db.ssl.key)} : {}};
    sslConfig = {...sslConfig, ...argv.reactor.db.ssl.minVersion ? {maxVersion: argv.reactor.db.ssl.minVersion} : {}};
    sslConfig = {...sslConfig, ...argv.reactor.db.ssl.maxVersion ? {minVersion: argv.reactor.db.ssl.maxVersion} : {}};
    sslConfig = {...sslConfig, ...argv.reactor.db.ssl.rejectUnauthorized ? {rejectUnauthorized: argv.reactor.db.ssl.rejectUnauthorized} : {}};


    return {  id: reactorId,
              plugin: "io-event-reactor-plugin-mysql",
              config: {
                    poolConfig : {
                       host     : argv.reactor.db.host,
                       port     : argv.reactor.db.port,
                       user     : argv.reactor.db.user,
                       password : argv.reactor.db.pw,
                       database : argv.reactor.db.name,
                       ssl      : sslConfig,
                       multipleStatements: true,
                       connectionLimit: 2
                    },
                    sqlTemplates: sqlTemplates,
                    sqlGenerator: sqlGenerator,
                }
            };
}

// we only maintain one proxy instance despite multiple shell command reactors
var statefulProcessCommandProxy = null;

// generate a shell proxy instance
function getStatefulProcessCommandProxyInstance() {

    if (statefulProcessCommandProxy != null) {
        return statefulProcessCommandProxy;
    } else {
        statefulProcessCommandProxy = new StatefulProcessCommandProxy({
                                            name: "statefulProcessCommandProxy",
                                            max: 1,
                                            min: 1,
                                            idleTimeoutMS: 300000,
                                            logFunction: logCallback,
                                            uid: argv.reactor.shell.uid,
                                            gid: argv.reactor.shell.gid,
                                            processCommand: '/bin/bash',
                                            processArgs:  ['-s'],
                                            processRetainMaxCmdHistory : 10,
                                            processCwd : './',
                                            validateFunction: function(processProxy) {
                                                return processProxy.isValid();
                                            }
                                        });
    }

    return statefulProcessCommandProxy;

}

/**
* generateShellExec - generates a new io-event-reactor-plugin-shell-exec plugin config
*
* @param reactorId id of the reactor to create
* @param cmdTemplates
* @param cmdGenerator
*/
function generateShellExec(reactorId, cmdTemplates, cmdGenerator) {
    return {  id: reactorId,
              plugin: "io-event-reactor-plugin-shell-exec",
              config: {
                  statefulProcessCommandProxy: {
                      instance: getStatefulProcessCommandProxyInstance()
                  },
                  commandTemplates: cmdTemplates,
                  commandGenerator: cmdGenerator
                }
            };
}

/**
* generateShellExec - generates a higher level file io reactor
*
* @param reactorType
* @param reactorId id of the reactor to create
* @param target target path
*/
function generateFileIoReactor(reactorType, reactorId, target) {
    var cmdTemplates = null;
    var cmdGenerator = null;

    if (reactorType == "copyFile") {
        cmdGenerator = function(ioEvent) {
            var targetParsed = Mustache.render(target,{'ioEvent':ioEvent});

            // create a context variable for the reactor
            // capturing the target of the command
            ioEvent.context[reactorType] = {};
            ioEvent.context[reactorType].target = targetParsed;

            return ["yes | cp {{{ioEvent.fullPath}}} " + targetParsed];
        };

    } else if (reactorType == "moveFile"){
        cmdGenerator = function(ioEvent) {
            var targetParsed = Mustache.render(target,{'ioEvent':ioEvent});

            // create a context variable for the reactor
            // capturing the target of the command
            ioEvent.context[reactorType] = {};
            ioEvent.context[reactorType].target = targetParsed;

            return [Mustache.render("mv {{{ioEvent.fullPath}}} " + targetParsed,{'ioEvent':ioEvent})];
        };

    } else if (reactorType == "copyAll"){
        cmdGenerator = function(ioEvent) {
            var targetParsed = Mustache.render(target,{'ioEvent':ioEvent});

            // create a context variable for the reactor
            // capturing the target of the command
            ioEvent.context[reactorType] = {};
            ioEvent.context[reactorType].target = targetParsed;

            return [Mustache.render("yes | cp -R {{{ioEvent.parentPath}}}/* " + targetParsed,{'ioEvent':ioEvent})];
        };

    } else if (reactorType == "moveAll"){
        cmdGenerator = function(ioEvent) {
            var targetParsed = Mustache.render(target,{'ioEvent':ioEvent});

            // create a context variable for the reactor
            // capturing the target of the command
            ioEvent.context[reactorType] = {};
            ioEvent.context[reactorType].target = targetParsed;

            return [Mustache.render("mv {{{ioEvent.parentPath}}}/* " + targetParsed,{'ioEvent':ioEvent})];
        };

    } else if (reactorType == "mkdir"){
        cmdGenerator = function(ioEvent) {
            var targetParsed = Mustache.render(target,{'ioEvent':ioEvent});

            // create a context variable for the reactor
            // capturing the target of the command
            ioEvent.context[reactorType] = {};
            ioEvent.context[reactorType].target = targetParsed;

            return ["mkdir -p " + targetParsed];
        };

    } else if (reactorType == "extractFileTo") {

        cmdGenerator = function(ioEvent) {

            var targetParsed = Mustache.render(target,{'ioEvent':ioEvent});

            // create a context variable for the reactor
            // capturing the target of the command
            ioEvent.context[reactorType] = {};
            ioEvent.context[reactorType].target = targetParsed;

            var lcasefname = ioEvent.filename.toLowerCase();

            if (lcasefname.endsWith('.tgz') || lcasefname.endsWith('.gz')) {
                return ['tar -xvf ' + ioEvent.fullPath + ' -C ' + targetParsed];

            } else if (lcasefname.endsWith('.zip')) {
                return ['unzip ' + ioEvent.fullPath + ' -d ' + targetParsed];

            } else {
                throw new Error("extractFileTo Reactor only supports, tgz, gz, or zip files, you passed: " + lcasefname);
            }
        };
    } else {
        throw new Error("Unknown reactorType: " + reactorType);
    }

    return generateShellExec(reactorId,cmdTemplates,cmdGenerator);
}

/**
* generateSqlReactor - generates a higher level sql op reactor
*
* @param reactorType
* @param reactorId id of the reactor to create
* @param target target path
*/
function generateSqlReactor(reactorType, reactorId, table, columns, values) {
    var sqlTemplates = null;
    var sqlGenerator = null;

    if (reactorType == "sqlInsert") {
        sqlGenerator = function(ioEvent) {
            var insert = "INSERT INTO " + table + " ("+columns.toString()+") VALUES ("
            for (let val of values) {
                var parsed = Mustache.render(val,{'ioEvent':ioEvent});
                insert += ("'" + parsed + "',");
            }
            insert = insert.slice(0, -1);
            insert += ");";

            return [insert];
        }
    } else {
        throw new Error("Unknown reactorType: " + reactorType);
    }

    return generateSqlInsert(reactorId,sqlTemplates,sqlGenerator);
}


/**
* generateReactors()
*
* generate all requested reactors in order
*/
function generateReactors() {
    var reactors = [];

    // the first one is always genTimestamp
    reactors.push({ id: "genTimestamp",
      plugin: "./default_plugins/code/codeReactorPlugin",
      config: {
          codeFunction: function(ioEvent) {
              return new Promise(function(resolve,reject){
                  ioEvent.context.timestamp = dateFormat(new Date(), "yyyymmdd_hhMMssL");
                  resolve(true);
              });
          }
      }
  });

    // for every bound reactorId to our evaluator
    // generate the appropriate configuration
    var i = 0;
    for (let reactorType of argv.evaluator.reactors) {
        i++;

        // handle shell-exec based reactors
        if (reactorType == "copyFile" ||
            reactorType == "moveFile" ||
            reactorType == "copyAll"  ||
            reactorType == "moveAll"  ||
            reactorType == "mkdir"  ||
            reactorType == "extractFileTo") {

            reactors.push(generateFileIoReactor(reactorType, reactorType+i, argv.reactor[reactorType].target));

        } else if (reactorType == "sqlInsert") {
            reactors.push(generateSqlReactor(reactorType, reactorType+i,
                                              argv.reactor[reactorType].table,
                                              argv.reactor[reactorType].columns,
                                              argv.reactor[reactorType].values));

        } else {
            throw new Error("Cannot generateReactor() for unknown reactorType: " + reactorType);
        }
    }

    // collect all ids
    var ids = [];
    for (let r of reactors) {
        ids.push(r.id);
    }

    // replace with new ids
    argv.evaluator.reactors = ids;

    return reactors;

}


// generate reactors
var reactorConfs = generateReactors();

// IoReactorService configuration
var ioReactorServiceConfig = {

  logFunction: logCallback,
  errorCallback: errorCallback,

  ioReactors: [
        {
            id: "overwatch",

            monitor: {
                plugin: "io-event-reactor-plugin-chokidar",
                config: {
                    paths: [argv.monitor.dir],
                    options: {
                        alwaysStat: true,
                        awaitWriteFinish: {
                            stabilityThreshold: argv.monitor.stabilityThreshold,
                            pollInterval: 1000
                        },
                        ignoreInitial:true
                    }
                }
            },

            evaluators: [
                {
                    evaluator: EvaluatorUtil.regex(argv.evaluator.events,argv.evaluator.regex,'ig'),
                    reactors: argv.evaluator.reactors
                }
            ],

            reactors: reactorConfs,

        }

   ]
};


//console.log(util.inspect(ioReactorServiceConfig,{depth:10}));

// launch!
var reactor = new IoReactorService(ioReactorServiceConfig);
