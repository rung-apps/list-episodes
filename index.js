import { create } from 'rung-sdk';
import { String as Text, Natural } from 'rung-sdk/dist/types';
import Bluebird from 'bluebird';
import agent from 'superagent';
import promisifyAgent from 'superagent-promise';
import { map, mergeAll, filter, propSatisfies, lte, gte, isNil, allPass } from 'ramda';
import moment from 'moment';

const request = promisifyAgent(agent, Bluebird);

function createAlert(episode, showName, { average }, network) {
    const { id, name, season, number, airdate, airtime, image, summary, url } = episode;
    const channel = `${network.name} - ${network.country.code}`;

    return {
        [id]: {
            title: `${showName} S${season}E${number} - ${name} (${moment(airdate).format('DD/MM/YYYY')})`,
            content: `${showName} S${season}E${number} - ${name} (${moment(airdate).format('DD/MM/YYYY')})`,
            comment: `
                ### ${name} ${_('at')} ${airtime} ${_('on')} ${channel}

                ${isNil(summary) ? '' : `\n${summary}`}
                ${isNil(image) ? '' : `\n![${name}](${image.medium})`}

                [${_('See episode info')}](${url})
                
            `
        }
    };
}

function EndedShowError(name, url) {
    this.name = 'EndedShowError';
    this.message = {
        title: `${name} ${_('is already completed.')}`,
        content: `${name} ${_('is already completed.')}`,
        comment: `_${name}_ ${_('is already finished, but if you want to know more about the series')}, [${_('access here')}](${url})`
    };
}

function main(context, done) {
    const { show, days } = context.params;
    const server = `http://api.tvmaze.com/singlesearch/shows?q=${show}&embed=episodes`;

    return request.get(server)
        .then(({ body }) => {
            const { name, rating, network, _embedded, status, url } = body;

            if (status === 'Ended') {
                throw new EndedShowError(name, url);
            }

            const today = moment().format('YYYY-MM-DD');
            const maxDay = moment().add(days, 'days').format('YYYY-MM-DD');
            const isBetween = allPass([lte(today), gte(maxDay)]);
            const episodes = filter(
                propSatisfies(isBetween, 'airdate'),
                _embedded.episodes
            );
            const alerts = mergeAll(map(
                episode => createAlert(episode, name, rating, network),
                episodes
            ));
            done({ alerts });
        })
        .catch(err => {
            return err instanceof EndedShowError
                ? done({ alerts: err.message })
                : done({ alerts: {} });
        });
}

const params = {
    show: {
        description: _('Which series do you want to follow?'),
        type: Text,
        required: true
    },
    days: {
        description: _('How many days before do you want to be informed?'),
        type: Natural,
        default: 30
    }
};

export default create(main, { params, primaryKey: true });
